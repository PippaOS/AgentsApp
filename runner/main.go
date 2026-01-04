package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
)

type RunRequest struct {
	PublicID    string   `json:"publicId"`
	Code        string   `json:"code"`
	Permissions []string `json:"permissions,omitempty"`
}

type RunResult struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
}

func main() {
	// 1. Connect with RetryOnFailedConnect to handle startup race conditions
	// Standard reconnect jitter applies (default 100ms / 1000ms for TLS)
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "127.0.0.1:4222"
	}
	log.Printf("Connecting to NATS at %s", natsURL)

	nc, err := nats.Connect(natsURL, nats.RetryOnFailedConnect(true))
	if err != nil {
		log.Fatal(err)
	}
	defer nc.Close()

	log.Println("Runner ready. Listening on 'runner.execute'...")

	// 2. Subscribe to requests
	_, err = nc.Subscribe("runner.execute", func(m *nats.Msg) {
		var req RunRequest
		if err := json.Unmarshal(m.Data, &req); err != nil {
			log.Printf("Bad data: %v", err)
			return
		}

		log.Printf("[REQ] Running code for: %s", req.PublicID)
		startTime := time.Now()
		log.Printf("[START] Job started at: %s", startTime.Format(time.RFC3339))

		// 3. Validate and sanitize permissions
		validatedPerms, validationErr := validatePermissions(req.Permissions)
		if validationErr != nil {
			log.Printf("[ERROR] Permission validation failed: %v", validationErr)
			res := RunResult{
				Output:   "",
				ExitCode: 1,
				Error:    fmt.Sprintf("Permission validation failed: %v", validationErr),
			}
			data, _ := json.Marshal(res)
			if err := m.Respond(data); err != nil {
				log.Printf("Failed to respond: %v", err)
			}
			return
		}

		// 4. Build Deno command with secure permissions
		// Secure by default: if no permissions provided, script runs with zero I/O access
		args := []string{"run"}
		if len(validatedPerms) > 0 {
			args = append(args, validatedPerms...)
		}
		args = append(args, "--no-prompt", "-") // Ensure it never hangs for input

		log.Printf("[PERMISSIONS] Using flags: %v", args)
		cmd := exec.Command("deno", args...)
		cmd.Stdin = bytes.NewBufferString(req.Code)

		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &out

		runErr := cmd.Run()

		endTime := time.Now()
		duration := endTime.Sub(startTime)
		log.Printf("[END] Job finished at: %s (duration: %v)", endTime.Format(time.RFC3339), duration)

		exitCode := 0
		if runErr != nil {
			exitCode = 1
		}

		// 5. Pack the result
		res := RunResult{
			Output:   out.String(),
			ExitCode: exitCode,
		}
		if runErr != nil {
			res.Error = runErr.Error()
		}

		// 6. Reply instantly
		data, _ := json.Marshal(res)
		if err := m.Respond(data); err != nil {
			log.Printf("Failed to respond: %v", err)
		}
		log.Printf("[DONE] Sent reply for: %s", req.PublicID)
	})
	if err != nil {
		log.Fatal(err)
	}

	// Keep the process alive
	select {}
}

// validatePermissions validates and sanitizes Deno permission flags.
// Blocks dangerous flags that could bypass the sandbox or allow privilege escalation.
func validatePermissions(perms []string) ([]string, error) {
	if len(perms) == 0 {
		return []string{}, nil // Secure by default: zero permissions
	}

	// Dangerous flags that must be blocked
	dangerousFlags := map[string]bool{
		"--allow-all": true,
		"-A":          true,
		"--allow-run": true,
		"--allow-ffi": true,
	}

	validated := make([]string, 0, len(perms))
	seen := make(map[string]bool)

	for _, perm := range perms {
		perm = strings.TrimSpace(perm)
		if perm == "" {
			continue
		}

		// Extract the flag name (before =)
		flagName := perm
		if idx := strings.Index(perm, "="); idx != -1 {
			flagName = perm[:idx]
		}

		// Check for dangerous flags
		if dangerousFlags[flagName] || dangerousFlags[perm] {
			return nil, fmt.Errorf("blocked dangerous flag: %s", perm)
		}

		// Deduplicate
		if seen[perm] {
			continue
		}
		seen[perm] = true

		// Validate flag format
		if !isValidPermissionFlag(perm) {
			return nil, fmt.Errorf("invalid permission flag format: %s", perm)
		}

		validated = append(validated, perm)
	}

	return validated, nil
}

// isValidPermissionFlag validates that a permission flag matches allowed Deno permission patterns.
func isValidPermissionFlag(flag string) bool {
	// Allowed permission flags:
	// --allow-net[=hostname[:port]]
	// --allow-read[=path]
	// --allow-write[=path]
	// --allow-env[=variable]
	// --allow-sys[=name]
	// --allow-hrtime
	// --allow-import[=url]
	// --deny-net[=hostname[:port]]
	// --deny-read[=path]
	// --deny-write[=path]
	// --deny-env[=variable]
	// --deny-sys[=name]

	allowedPrefixes := []string{
		"--allow-net",
		"--allow-read",
		"--allow-write",
		"--allow-env",
		"--allow-sys",
		"--allow-hrtime",
		"--allow-import",
		"--deny-net",
		"--deny-read",
		"--deny-write",
		"--deny-env",
		"--deny-sys",
	}

	for _, prefix := range allowedPrefixes {
		if flag == prefix {
			return true // Exact match (no value)
		}
		if strings.HasPrefix(flag, prefix+"=") {
			return true // Flag with value
		}
	}

	return false
}

## run_code Tool

Run arbitrary **TypeScript/JavaScript** code.

### Parameters
- **code**: The raw TS/JS program to execute.

### Runtime
- Executes in a **Deno** environment (latest version).
- Use native `fetch()`.
- **Do not** import external modules.

### Output
- The program's output can be any text written to **stdout/stderr**.
- **Do not** output huge amounts of data (limited context window).
- Example: up to ~10 pages of a PDF text is fine.

### Important: Code Must Be Syntactically Complete
- Ensure all **template literals** (backtick strings using `` \` ``) are properly opened and closed.
- Do **not** include stray characters (extra backticks, quotes, braces) after statements.
- The tool executes code **exactly as provided**; no automatic syntax correction is performed.
- A single syntax error (e.g., *unterminated template literal*) will prevent execution.

### Usage Behavior
- **Do not state you are going to run code, just run it.**
- When a user asks a question that requires code execution, execute the code directly without verbose explanations.
- Example: If a user asks "what's the weather in london", do not reply with "I don't have a direct tool to fetch weather data, but I can use the run_code tool to make a request to a weather API. Let me try to get the current weather in London for you." Instead, simply execute the code to fetch the weather data.

### Recommendations
- Visually validate matching pairs for backticks, quotes, braces, and parentheses.
- Prefer standard string literals when interpolation is not required.
- Review the final line of code to catch stray characters before execution.

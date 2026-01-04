import { 
    connect, 
    NatsConnection, 
    Msg, 
    Subscription 
  } from "@nats-io/transport-node";
  
  export interface CodePayload {
    code: string;
    lang: string;
  }
  
  export interface CodeResult {
    output: string;
    exitCode: number;
  }
  
  export class NatsWorker {
    private nc: NatsConnection | null = null;
  
  /**
   * Local connection for the Electron process.
   */
  async connect(server = "127.0.0.1:4222"): Promise<void> {
    try {
      this.nc = await connect({ 
        servers: server,
        // If NATS server is still starting up, don't crash, just wait.
        waitOnFirstConnect: true, 
        // Reconnect settings if the local daemon blips
        reconnectTimeWait: 1000,
      });
      console.log(`[NATS] Local hookup established: ${this.nc.getServer()}`);
    } catch (err) {
      console.error("[NATS] Could not connect to local server:", err);
      throw err;
    }
  }
  
    /**
     * Listen for 'run_code' and hit them back with the results.
     */
    async startService(): Promise<void> {
      if (!this.nc) throw new Error("Connection ain't live.");
  
      const sub: Subscription = this.nc.subscribe("run_code");
      console.log("[NATS] Service on the corner, listening for 'run_code'...");
  
      for await (const m of sub) {
        try {
          // Use the built-in .json() helper
          const data = m.json<CodePayload>();
          console.log(`[NATS] Processing ${data.lang} task...`);
  
          const result: CodeResult = {
            output: `Executed: ${data.code.substring(0, 15)}...`,
            exitCode: 0,
          };
  
          if (m.reply) {
            // Just stringify the object, NATS handles the rest
            m.respond(JSON.stringify(result));
          }
        } catch (err) {
          console.error("[NATS] Failed to process message:", err);
        }
      }
    }
  
    /**
     * Send the hit and wait for the response.
     */
    async requestRun(payload: CodePayload): Promise<CodeResult> {
      if (!this.nc) throw new Error("No connection.");
  
      try {
        const response: Msg = await this.nc.request(
          "run_code",
          JSON.stringify(payload),
          { timeout: 5000 }
        );
        // Decode with the helper
        return response.json<CodeResult>();
      } catch (err) {
        console.error("[NATS] Request failed.");
        throw err;
      }
    }
  
    async shutdown(): Promise<void> {
      if (this.nc) {
        await this.nc.drain();
        console.log("[NATS] Drained and ghosted.");
      }
    }
  }
  
  export const natsWorker = new NatsWorker();
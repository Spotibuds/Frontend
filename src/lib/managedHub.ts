import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import { API_CONFIG } from "./config";
import { ensureAccessToken, getSessionGeneration, SESSION_EVENT } from "./session";

// One connection and one start operation per hub, bound to its owning session.
export class ManagedHub {
  connection: HubConnection | null = null;
  private startPromise: Promise<void> | null = null;
  private enabled = false;
  private stopPromise: Promise<void> | null = null;
  private version = 0;
  constructor(
    private path: string,
    private setup: (connection: HubConnection) => void,
    private connected: () => Promise<void> | void,
    private changed: (state: HubConnectionState) => void
  ) {
    if (typeof window !== "undefined")
      window.addEventListener(SESSION_EVENT, event => {
        if ((event as CustomEvent).detail?.reason !== "authenticated") void this.stop();
      });
  }
  async start(): Promise<void> {
    if (this.stopPromise) await this.stopPromise;
    this.enabled = true;
    if (this.startPromise) return this.startPromise;
    if (this.connection?.state === HubConnectionState.Connected) return;
    const version = this.version;
    const generation = getSessionGeneration();
    const operation = (async () => {
      const token = await ensureAccessToken();
      if (
        !token ||
        !this.enabled ||
        version !== this.version ||
        generation !== getSessionGeneration()
      )
        throw new Error("Sign in to connect.");
      if (!this.connection) {
        const connection = new HubConnectionBuilder()
          .withUrl(`${API_CONFIG.USER_API}/${this.path}`, {
            accessTokenFactory: async () => {
              if (
                !this.enabled ||
                version !== this.version ||
                generation !== getSessionGeneration()
              )
                return "";
              return (await ensureAccessToken()) || "";
            },
            withCredentials: true,
          })
          .withAutomaticReconnect([0, 1000, 3000, 10000, 20000])
          .configureLogging(LogLevel.None)
          .build();
        this.connection = connection;
        this.setup(connection);
        connection.onreconnecting(() => {
          if (this.connection === connection && version === this.version)
            this.changed(HubConnectionState.Reconnecting);
        });
        connection.onreconnected(async () => {
          if (!this.enabled || version !== this.version || this.connection !== connection) {
            await connection.stop();
            return;
          }
          try {
            await this.connected();
            if (
              this.enabled &&
              this.connection === connection &&
              version === this.version &&
              generation === getSessionGeneration()
            )
              this.changed(HubConnectionState.Connected);
            else await connection.stop();
          } catch {
            if (this.connection === connection && version === this.version)
              this.changed(HubConnectionState.Disconnected);
            await connection.stop();
          }
        });
        connection.onclose(() => {
          if (this.connection === connection && version === this.version)
            this.changed(HubConnectionState.Disconnected);
        });
      }
      const connection = this.connection;
      if (connection.state !== HubConnectionState.Disconnected) return;
      this.changed(HubConnectionState.Connecting);
      try {
        await connection.start();
        if (!this.enabled || version !== this.version || generation !== getSessionGeneration()) {
          await connection.stop();
          return;
        }
        await this.connected();
        if (
          this.enabled &&
          this.connection === connection &&
          version === this.version &&
          generation === getSessionGeneration()
        )
          this.changed(HubConnectionState.Connected);
        else await connection.stop();
      } catch (error) {
        if (this.connection === connection && version === this.version)
          this.changed(HubConnectionState.Disconnected);
        throw error;
      }
    })();
    this.startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.startPromise === operation) this.startPromise = null;
    }
  }
  async invoke<T = void>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.enabled || this.connection?.state !== HubConnectionState.Connected)
      throw new Error("Connection unavailable. Keep your draft and retry after reconnecting.");
    return this.connection.invoke<T>(method, ...args);
  }
  async stop(): Promise<void> {
    this.enabled = false;
    const version = ++this.version;
    const connection = this.connection;
    this.connection = null;
    this.startPromise = null;
    const operation = connection ? connection.stop() : Promise.resolve();
    this.stopPromise = operation;
    try {
      await operation;
    } finally {
      if (this.stopPromise === operation) this.stopPromise = null;
      if (version === this.version && !this.connection)
        this.changed(HubConnectionState.Disconnected);
    }
  }
  state() {
    return this.connection?.state || HubConnectionState.Disconnected;
  }
}

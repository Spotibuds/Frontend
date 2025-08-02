type EventHandler = (...args: any[]) => void;

class EventBus {
  private events: { [key: string]: EventHandler[] } = {};

  on(event: string, handler: EventHandler): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(handler);
  }

  off(event: string, handler: EventHandler): void {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(h => h !== handler);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (this.events[event]) {
      this.events[event].forEach(handler => handler(...args));
    }
  }
}

export const eventBus = new EventBus(); 
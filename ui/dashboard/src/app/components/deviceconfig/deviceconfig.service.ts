// device-config.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { filter, firstValueFrom, map, take } from 'rxjs';

export interface DeviceConfigInterface {
  doorOpen: boolean;
  flapRule: 0 | 1 | 2 | 3;
  version: string;
}

@Injectable({
  providedIn: 'root',
})
export class DeviceConfigService {
  private socket$!: WebSocketSubject<any>;
  
  // Track state using Angular Signals
  private _config = signal<DeviceConfigInterface | null>(null);
  readonly config = computed(() => this._config());
  
  // Track pending states
  readonly isSaving = signal<boolean>(false);

  /**
   * 1. Connect to WebSocket and resolve when the initial data frame is received.
   * This can be safely called during provideAppInitializer() to block app boot.
   */
  initAndFetchConfig(url: string): Promise<DeviceConfigInterface> {
    this.socket$ = webSocket(url);

    const initialConfig$ = this.socket$.pipe(
      // Assume server pushes configuration frame immediately upon handshake
      filter((msg: any) => msg.type === 'INITIAL_DEVICE_CONFIG'),
      map((msg: any) => msg.data as DeviceConfigInterface),
      take(1) // Automatically unsubscribes after getting the first piece of data
    );

    return firstValueFrom(initialConfig$).then((config) => {
      this._config.set(config);
      this.listenForLiveUpdates(); // Start a background listener if settings change live
      return config;
    });
  }

  /**
   * 2 & 3. Send client modifications and wait specifically for the server's confirmation
   */
  updateConfigOnServer(updatedFields: Partial<DeviceConfigInterface>): Promise<boolean> {
    this.isSaving.set(true);

    // Create a unique tracking ID to avoid cross-talk if multiple components push messages
    const requestId = crypto.randomUUID(); 

    // Prepare the payload
    const payload = {
      type: 'UPDATE_DEVICE_CONFIG',
      requestId: requestId,
      data: updatedFields
    };

    // Set up the listener *before* we push the message to avoid missing an instantaneous response
    const confirmation$ = this.socket$.pipe(
      filter((msg: any) => msg.type === 'DEVICE_CONFIG_ACK' && msg.requestId === requestId),
      take(1)
    );

    // Push the changes down the pipe
    this.socket$.next(payload);

    // Return a Promise that resolves when the server confirms the exact message was processed
    return firstValueFrom(confirmation$)
      .then((response: any) => {
        if (response.success) {
          // Optimistically or explicitly update your local signal with the confirmed values
          this._config.update((current) => current ? { ...current, ...updatedFields } : null);
          return true;
        }
        throw new Error(response.error || 'Server rejected changes');
      })
      .finally(() => {
        this.isSaving.set(false);
      });
  }

  private listenForLiveUpdates() {
    this.socket$.pipe(
      filter((msg: any) => msg.type === 'BROADCAST_DEVICE_CONFIG_CHANGE')
    ).subscribe((msg: any) => {
      this._config.set(msg.data);
    });
  }
}

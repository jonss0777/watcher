import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { DeviceConfigService } from './components/deviceconfig/deviceconfig.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes), provideClientHydration(),
    provideAppInitializer(() => {
      const deviceConfigService = inject(DeviceConfigService);
      // Blocks application boot until the initial device configuration is fetched from the server via WebSocket.
      return deviceConfigService.initAndFetchConfig('ws://localhost:8889/ws/device-config');
    }),
  ]
};

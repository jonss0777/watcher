import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VideoRtc } from './components/videortc/videortc';
import { DeviceConfiguration } from './components/deviceconfig/deviceconfig';

@Component({
  selector:'app-root',
  imports: [RouterOutlet, VideoRtc, DeviceConfiguration],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('dashboard');
}

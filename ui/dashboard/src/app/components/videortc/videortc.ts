
import { Component, ElementRef, OnDestroy, ViewChild, afterNextRender, signal } from '@angular/core';

@Component({
  selector: 'video-rtc',
  standalone: true,
  template: `
  <video #videoPlayer controls autoplay muted playsinline style="width: 100%;">
  </video>
  @if (!connected()) {
  <button (click)="onSubmit($event)">Reconnect</button>
} @else{
    <p>Connected to MediaMTX</p>
    }
  `
})


export class VideoRtc implements OnDestroy {
  @ViewChild('videoPlayer', { static: true }) videoPlayer!: ElementRef<HTMLVideoElement>;
  private peerConnection!: RTCPeerConnection;
  connected = signal(false);

  // The standard WHEP (WebRTC HTTP Egress Protocol) endpoint provided by MediaMTX
  private whepUrl = 'http://localhost:8889/mystream/whep'; 

  constructor() {
    afterNextRender(async () => {
      await this.startWebRTC();
    });
    
  }

  async startWebRTC() {
    const video = this.videoPlayer.nativeElement;

    // 1. Initialize PeerConnection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:://google.com' }] // Add your TURN/STUN if outside LAN
    });

    // 2. Set up event to grab incoming stream tracks
    this.peerConnection.ontrack = (event) => {
      if (video.srcObject !== event.streams[0]) {
        video.srcObject = event.streams[0];
      }
    };

    // 3. Configure the connection to receive Audio and Video
    this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });

    // 4. Create local SDP Offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // 5. Exchange SDP with MediaMTX via WHEP
    try {
      const response = await fetch(this.whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp
      });

      if (!response.ok) throw new Error('WHEP signaling failed');

      const answerSdp = await response.text();
      
      // 6. Apply the remote Answer from MediaMTX
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
      );
    } catch (error) {
      console.error('Failed to establish MediaMTX RTC connection:', error);
    }
  }

  ngOnDestroy() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
  }

  onSubmit(event: Event){
    event.preventDefault();

    // TODO: 
    // Implement logic to re-establish the WebRTC connection if needed
    
    console.log('Reconnecting to MediaMTX...'); 
    this.startWebRTC();
    console.log('Connected status: ', this.connected());
    this.connected.update(current => !current);
  }
}

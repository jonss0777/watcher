import { Component, inject, effect } from '@angular/core';
import { form, required } from "@angular/forms/signals";
import { DeviceConfigService } from './deviceconfig.service';


@Component({
  imports: [],
  standalone: true,
  selector: 'device-configuration',
  template: `
    <div>
      <p>Device status: 
        @if (service.isSaving()) {
          <span style="color: orange;">Saving updates...</span>
        } @else {
          <span style="color: green;">Synced</span>
        }
      </p>
    </div>
    
    <form (submit)="onSubmit($event)">
      <div>
        <p>Flap Rule:</p>
        
        <!-- Option 0 -->
        <input type="radio" id="locked" name="flapRule"
               [checked]="service.config()?.flapRule === 0" 
               (change)="setFlapRule(0)"
               [disabled]="service.isSaving()">
        <label for="locked">Locked</label>

        <!-- Option 1 -->
        <input type="radio" id="inbound" name="flapRule"
               [checked]="service.config()?.flapRule === 1" 
               (change)="setFlapRule(1)"
               [disabled]="service.isSaving()">
        <label for="inbound">Inbound</label>

        <!-- Option 2 -->
        <input type="radio" id="outbound" name="flapRule"
               [checked]="service.config()?.flapRule === 2" 
               (change)="setFlapRule(2)"
               [disabled]="service.isSaving()">
        <label for="outbound">Outbound</label>

        <!-- Option 3 -->
        <input type="radio" id="twoway" name="flapRule"
               [checked]="service.config()?.flapRule === 3" 
               (change)="setFlapRule(3)"
               [disabled]="service.isSaving()">
        <label for="twoway">Two-Way</label>
      </div>
      
      <button type="submit" [disabled]="!deviceConfigForm.valid() || service.isSaving()">
        Save
      </button>
    </form>
  `,
})
export class DeviceConfiguration {
  // Inject the centralized WebSocket configuration service
  protected service = inject(DeviceConfigService);

  // Bind the Signal Form validation layer directly to the service's read-only signal.
  // When live WebSocket updates hit the service, this form validation recalculates instantly.
  deviceConfigForm = form(this.service.config, (schemaPath) => {
    required(schemaPath.flapRule, { message: "Choose a flap rule" });
  });

  setFlapRule(value: 0 | 1 | 2 | 3) {
    // If you want to update the UI instantly before the server ACK arrives, 
    // you can push the update straight to the server right when they click:
    this.saveFieldChange({ flapRule: value });
  }

  async onSubmit(event: Event) {
    event.preventDefault();
    
    if (this.deviceConfigForm.valid()) {
      const currentConfig = this.service.config();
      if (currentConfig) {
        // Send the complete rule state or just the modified fields
        await this.saveFieldChange({ flapRule: currentConfig.flapRule });
      }
    }
  }

  private async saveFieldChange(fields: { flapRule: 0 | 1 | 2 | 3 }) {
    try {
      // Dispatches the transaction payload with a unique ID and resolves on ACK
      const success = await this.service.updateConfigOnServer(fields);
      if (success) {
        console.log('Configuration acknowledged by server!');
      }
    } catch (error) {
      console.error('Failed to sync configuration:', error);
      // Optional: Handle error UI state or roll back UI choices here
    }
  }
}

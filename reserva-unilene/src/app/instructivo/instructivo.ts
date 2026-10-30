import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-instructivo',
  styleUrl: './instructivo.css',
  templateUrl: './instructivo.html',
})
export class Instructivo {}

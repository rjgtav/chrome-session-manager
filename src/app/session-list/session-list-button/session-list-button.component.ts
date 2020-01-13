import { Component, ChangeDetectionStrategy, Input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-session-list-button',
  templateUrl: './session-list-button.component.html',
  styleUrls: ['./session-list-button.component.scss']
})
export class SessionListButtonComponent {

  @Input() color: string;
  @Input() icon: string;
  @Input() label: string;

  constructor() { }

}

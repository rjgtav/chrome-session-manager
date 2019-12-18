import { Component, OnInit, ChangeDetectionStrategy, Input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-session-list-button',
  templateUrl: './session-list-button.component.html',
  styleUrls: ['./session-list-button.component.scss']
})
export class SessionListButtonComponent {

  @Input() icon: string;
  @Input() label: string;

  constructor() { }

}

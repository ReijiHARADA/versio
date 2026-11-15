/**
 * Chrome/WebKit can report the Enter which confirms a Japanese IME candidate
 * as either `isComposing` or legacy keyCode 229.  Commands must not consume
 * that keypress as a form submit, save, or navigation action.
 */
export function isImeComposing(event: {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}): boolean {
  return event.isComposing === true ||
    event.keyCode === 229 ||
    event.nativeEvent?.isComposing === true ||
    event.nativeEvent?.keyCode === 229;
}

export const LOG_SCROLL_BOTTOM = 1_000_000_000;

export type LogScrollFrame = (callback: () => void) => void;

/**
 * Keeps a log pane pinned to its tail without reading layout in the event that
 * appended the line. Scroll metrics are sampled only from the browser's scroll
 * event, after layout has already been resolved for that scroll.
 */
export class LogScrollFollower {
  private following = true;
  private framePending = false;

  observeScroll(scrollHeight: number, scrollTop: number, clientHeight: number): void {
    this.following = scrollHeight - scrollTop - clientHeight < 24;
  }

  requestBottom(
    isActive: () => boolean,
    scheduleFrame: LogScrollFrame,
    scrollToBottom: () => void,
  ): void {
    if (!this.following || this.framePending || !isActive()) return;
    this.framePending = true;
    scheduleFrame(() => {
      this.framePending = false;
      if (!this.following || !isActive()) return;
      scrollToBottom();
    });
  }
}

import { describe, expect, it, vi } from 'vitest';
import { LogScrollFollower } from '../src/ui/hud/chat/log_scroll_follower';

describe('LogScrollFollower', () => {
  it('coalesces active tail-follow requests without sampling layout', () => {
    const follower = new LogScrollFollower();
    const frames: Array<() => void> = [];
    const scroll = vi.fn();

    follower.requestBottom(
      () => true,
      (frame) => frames.push(frame),
      scroll,
    );
    follower.requestBottom(
      () => true,
      (frame) => frames.push(frame),
      scroll,
    );

    expect(frames).toHaveLength(1);
    expect(scroll).not.toHaveBeenCalled();
    frames[0]();
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('does not follow while the player is reading older lines', () => {
    const follower = new LogScrollFollower();
    const schedule = vi.fn();

    follower.observeScroll(1000, 200, 300);
    follower.requestBottom(() => true, schedule, vi.fn());

    expect(schedule).not.toHaveBeenCalled();
  });

  it('defers a hidden pane until activation', () => {
    const follower = new LogScrollFollower();
    const frames: Array<() => void> = [];
    let active = false;
    const scroll = vi.fn();

    follower.requestBottom(
      () => active,
      (frame) => frames.push(frame),
      scroll,
    );
    expect(frames).toHaveLength(0);

    active = true;
    follower.requestBottom(
      () => active,
      (frame) => frames.push(frame),
      scroll,
    );
    active = false;
    frames[0]();
    expect(scroll).not.toHaveBeenCalled();
  });
});

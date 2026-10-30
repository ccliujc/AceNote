import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { PetApi } from '@acenote/contracts';
import {
  PET_CHARACTER_HEIGHT,
  PET_HEIGHT,
  PET_MESSAGE_HEIGHT,
  PET_WIDTH,
} from '../../shared/pet-layout';
import petIdle from '../../../resources/pet/ryoma-idle.png';
import petHit from '../../../resources/pet/ryoma-hit.png';
import petAce from '../../../resources/pet/ryoma-ace.png';
import './pet.css';

declare global {
  interface Window {
    pet: PetApi;
  }
}

type Mood = 'idle' | 'reminder' | 'hit' | 'ace';
const assets = { idle: petIdle, reminder: petIdle, hit: petHit, ace: petAce };
const MESSAGE_DURATION = 15_000;

export function PetApp() {
  const [mood, setMood] = useState<Mood>('idle');
  const [bubble, setBubble] = useState('');
  const [interactive, setInteractive] = useState(false);
  const timer = useRef<number | null>(null);
  const messageTimer = useRef<number | null>(null);
  const overCharacter = useRef(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const dismissMessage = useCallback(() => {
    if (messageTimer.current !== null)
      window.clearTimeout(messageTimer.current);
    messageTimer.current = null;
    setBubble('');
    setInteractive(overCharacter.current);
    window.pet.setInteractive(overCharacter.current);
  }, []);

  const showMessage = useCallback(
    (message: string) => {
      if (messageTimer.current !== null)
        window.clearTimeout(messageTimer.current);
      setBubble(message);
      messageTimer.current = window.setTimeout(
        dismissMessage,
        MESSAGE_DURATION,
      );
    },
    [dismissMessage],
  );

  function play(next: Mood, duration = 900) {
    if (timer.current) window.clearTimeout(timer.current);
    setMood(next);
    timer.current = window.setTimeout(() => setMood('idle'), duration);
  }

  function celebrate() {
    if (timer.current) window.clearTimeout(timer.current);
    setMood('hit');
    timer.current = window.setTimeout(() => {
      setMood('ace');
      timer.current = window.setTimeout(() => setMood('idle'), 900);
    }, 700);
  }

  useEffect(() => {
    const offCompleted = window.pet.onTaskCompleted(({ title }) => {
      showMessage(`“${title}”完成，漂亮的一分！`);
      celebrate();
    });
    const offReminder = window.pet.onReminderDue(({ reminder }) => {
      showMessage(`该上场了：${reminder.title}`);
      play('reminder', 900);
    });
    return () => {
      offCompleted();
      offReminder();
      if (timer.current) window.clearTimeout(timer.current);
      if (messageTimer.current !== null)
        window.clearTimeout(messageTimer.current);
    };
  }, [showMessage]);

  function enter(event: React.MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const insideBubble =
      event.target instanceof Element &&
      Boolean(event.target.closest('.pet-bubble'));
    overCharacter.current =
      x > 24 &&
      x < PET_WIDTH - 24 &&
      y > PET_MESSAGE_HEIGHT + 24 &&
      y < PET_HEIGHT - 14;
    const inside = insideBubble || overCharacter.current;
    if (inside !== interactive) {
      setInteractive(inside);
      window.pet.setInteractive(inside);
    }
  }

  function leave() {
    overCharacter.current = false;
    setInteractive(false);
    window.pet.setInteractive(false);
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragging.current = true;
    moved.current = false;
    dragStart.current = { x: event.screenX, y: event.screenY };
    event.currentTarget.setPointerCapture(event.pointerId);
    window.pet.startDrag(event.screenX, event.screenY);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) {
      if (
        !moved.current &&
        dragStart.current &&
        Math.hypot(
          event.screenX - dragStart.current.x,
          event.screenY - dragStart.current.y,
        ) < 5
      )
        return;
      moved.current = true;
      window.pet.dragTo(event.screenX, event.screenY);
    }
  }
  function up() {
    if (!dragging.current) return;
    dragging.current = false;
    dragStart.current = null;
    window.pet.endDrag();
  }
  function click(event: MouseEvent<HTMLDivElement>) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (event.detail > 1) return;
    void window.pet.openToday();
  }

  return (
    <div
      className="pet-stage"
      style={{ width: PET_WIDTH, height: PET_HEIGHT }}
      onMouseMove={enter}
      onMouseLeave={leave}
    >
      <div className="pet-player-area" style={{ height: PET_CHARACTER_HEIGHT }}>
        <div
          className={`pet-character mood-${mood}`}
          title="单击打开日程浮窗 · 拖动移动"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={click}
        >
          <img
            src={assets[mood]}
            alt="AceNote 越前龙马桌宠"
            draggable={false}
          />
          {mood === 'ace' && <span className="ace-ring" aria-hidden="true" />}
        </div>
      </div>
      {bubble && (
        <div
          className="pet-bubble"
          role="status"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>{bubble}</span>
          <button
            aria-label="关闭桌宠消息"
            onClick={(event) => {
              event.stopPropagation();
              dismissMessage();
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="m1 1 8 8M9 1 1 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

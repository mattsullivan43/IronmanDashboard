import { useState, useEffect, useMemo, useCallback } from 'react';
import HudPanel from '../components/ui/HudPanel';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import GlowBadge from '../components/ui/GlowBadge';
import { calendar } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  MapPin,
  Clock,
  Users,
  WifiOff,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
  subMonths,
  subWeeks,
  subDays,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  getHours,
  getMinutes,
  differenceInMinutes,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { CalendarEvent } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'day' | 'week' | 'month';

interface ConflictPair {
  event1: CalendarEvent;
  event2: CalendarEvent;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUR_START = 7;
const HOUR_END = 21; // 9 PM
const HOUR_HEIGHT = 60; // px per hour in time grids
const TOTAL_HOURS = HOUR_END - HOUR_START;

const SOURCE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; glow: string }> = {
  google: {
    bg: 'bg-[#00D4FF]/15',
    border: 'border-[#00D4FF]/40',
    text: 'text-[#00D4FF]',
    dot: 'bg-[#00D4FF]',
    glow: 'shadow-[0_0_8px_rgba(0,212,255,0.25)]',
  },
  microsoft: {
    bg: 'bg-[#8B5CF6]/15',
    border: 'border-[#8B5CF6]/40',
    text: 'text-[#8B5CF6]',
    dot: 'bg-[#8B5CF6]',
    glow: 'shadow-[0_0_8px_rgba(139,92,246,0.25)]',
  },
  manual: {
    bg: 'bg-[#FFB800]/15',
    border: 'border-[#FFB800]/40',
    text: 'text-[#FFB800]',
    dot: 'bg-[#FFB800]',
    glow: 'shadow-[0_0_8px_rgba(255,184,0,0.25)]',
  },
};

const SOURCE_LABELS: Record<string, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft Outlook',
  manual: 'Manual',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEventPosition(event: CalendarEvent) {
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const startHour = getHours(start) + getMinutes(start) / 60;
  const endHour = getHours(end) + getMinutes(end) / 60;

  const clampedStart = Math.max(startHour, HOUR_START);
  const clampedEnd = Math.min(endHour, HOUR_END);

  const top = (clampedStart - HOUR_START) * HOUR_HEIGHT;
  const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 20);

  return { top, height };
}

function isEventInConflict(eventId: string, conflicts: ConflictPair[]): boolean {
  return conflicts.some((c) => c.event1.id === eventId || c.event2.id === eventId);
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => {
    const eventStart = parseISO(e.startTime);
    return isSameDay(eventStart, day);
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const views: ViewMode[] = ['day', 'week', 'month'];

  return (
    <div className="flex rounded-md border border-[#1A2035] overflow-hidden">
      {views.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`
            px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200
            ${
              view === v
                ? 'bg-[#00D4FF]/15 text-[#00D4FF] shadow-[inset_0_0_12px_rgba(0,212,255,0.15),0_0_12px_rgba(0,212,255,0.2)]'
                : 'bg-transparent text-white/40 hover:text-white/70 hover:bg-white/5'
            }
          `}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function TimeGutter() {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <div className="relative w-16 flex-shrink-0">
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute right-2 text-[10px] font-mono text-white/30"
          style={{ top: (hour - HOUR_START) * HOUR_HEIGHT - 6 }}
        >
          {format(new Date(2000, 0, 1, hour), 'h a')}
        </div>
      ))}
    </div>
  );
}

function TimeGridLines() {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <>
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-[#1A2035]/60"
          style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
        />
      ))}
    </>
  );
}

function EventBlock({
  event,
  hasConflict,
  onClick,
  style,
  compact = false,
}: {
  event: CalendarEvent;
  hasConflict: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const source = SOURCE_COLORS[event.source] || SOURCE_COLORS.manual;
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02, zIndex: 50 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={`
        absolute left-1 right-1 rounded-md px-2 py-1 text-left overflow-hidden cursor-pointer
        border backdrop-blur-sm transition-shadow duration-200
        ${source.bg} ${source.border} ${source.glow}
        ${hasConflict ? 'ring-2 ring-[#FF3B3B]/60 border-[#FF3B3B]/50' : ''}
      `}
      style={style}
    >
      {hasConflict && (
        <span className="absolute top-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#FF3B3B]/20 text-[#FF3B3B] border border-[#FF3B3B]/30">
          <AlertTriangle className="w-2.5 h-2.5" />
          Conflict
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${source.dot}`} />
        <span className={`text-xs font-medium truncate ${compact ? 'text-[10px]' : ''} text-white/90`}>
          {event.title}
        </span>
      </div>
      {!compact && (
        <div className="text-[10px] text-white/40 font-mono mt-0.5">
          {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
        </div>
      )}
    </motion.button>
  );
}

function MonthEventPill({
  event,
  hasConflict,
  onClick,
}: {
  event: CalendarEvent;
  hasConflict: boolean;
  onClick: () => void;
}) {
  const source = SOURCE_COLORS[event.source] || SOURCE_COLORS.manual;
  const start = parseISO(event.startTime);

  return (
    <motion.button
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.12 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`
        w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate
        border backdrop-blur-sm cursor-pointer
        ${source.bg} ${source.border}
        ${hasConflict ? 'ring-1 ring-[#FF3B3B]/50' : ''}
      `}
    >
      <span className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${source.dot}`} />
        <span className="text-white/80 font-medium truncate">
          {format(start, 'h:mm')} {event.title}
        </span>
        {hasConflict && <AlertTriangle className="w-2.5 h-2.5 text-[#FF3B3B] flex-shrink-0" />}
      </span>
    </motion.button>
  );
}

function EventDetailModal({
  event,
  isOpen,
  onClose,
}: {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!event) return null;

  const source = SOURCE_COLORS[event.source] || SOURCE_COLORS.manual;
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const duration = differenceInMinutes(end, start);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Event Details" size="md">
      <div className="space-y-5">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${source.dot} shadow-[0_0_8px_rgba(0,212,255,0.4)]`} />
          <div>
            <h3 className="text-lg font-semibold text-white">{event.title}</h3>
            <span className={`text-xs font-medium uppercase tracking-wider ${source.text}`}>
              {SOURCE_LABELS[event.source] || event.source}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid gap-3">
          <div className="flex items-center gap-3 text-sm text-white/60">
            <Clock className="w-4 h-4 text-[#00D4FF]/60" />
            <span>
              {format(start, 'EEEE, MMMM d, yyyy')}
              <br />
              <span className="font-mono text-white/80">
                {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
              </span>
              <span className="text-white/30 ml-2">({duration} min)</span>
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-3 text-sm text-white/60">
              <MapPin className="w-4 h-4 text-[#00D4FF]/60" />
              <span className="text-white/80">{event.location}</span>
            </div>
          )}

          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-3 text-sm text-white/60">
              <Users className="w-4 h-4 text-[#00D4FF]/60 mt-0.5" />
              <div className="flex flex-wrap gap-1.5">
                {event.attendees.map((a, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs bg-white/5 border border-[#1A2035] text-white/70"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {event.description && (
          <div className="pt-3 border-t border-[#1A2035]">
            <p className="text-sm text-white/50 leading-relaxed whitespace-pre-wrap">
              {event.description}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      {/* Glowing offline icon */}
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="relative mb-8"
      >
        <WifiOff className="w-16 h-16 text-[#00D4FF]/30" />
        <div className="absolute inset-0 w-16 h-16 rounded-full bg-[#00D4FF]/5 blur-xl" />
      </motion.div>

      <h2 className="text-xl font-semibold text-white/80 mb-2 tracking-wide">
        Calendar systems offline, sir
      </h2>
      <p className="text-sm text-white/30 mb-10 max-w-md">
        Connect your calendar accounts to enable unified scheduling intelligence across all platforms.
      </p>

      <div className="flex items-center gap-4">
        {/* Google */}
        <a href="/settings#calendars">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="flex flex-col items-center gap-3 px-8 py-6 rounded-lg border border-[#1A2035] bg-[#0D1321]/60 hover:border-[#00D4FF]/30 hover:bg-[#00D4FF]/5 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#00D4FF]/10 flex items-center justify-center group-hover:shadow-[0_0_16px_rgba(0,212,255,0.3)] transition-shadow">
              <Calendar className="w-5 h-5 text-[#00D4FF]" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/60 group-hover:text-[#00D4FF] transition-colors">
              Google Calendar
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[#00D4FF]/60 font-medium">
              Connect
            </span>
          </motion.div>
        </a>

        {/* Microsoft */}
        <a href="/settings#calendars">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="flex flex-col items-center gap-3 px-8 py-6 rounded-lg border border-[#1A2035] bg-[#0D1321]/60 hover:border-[#8B5CF6]/30 hover:bg-[#8B5CF6]/5 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-[#8B5CF6]/10 flex items-center justify-center group-hover:shadow-[0_0_16px_rgba(139,92,246,0.3)] transition-shadow">
              <Calendar className="w-5 h-5 text-[#8B5CF6]" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/60 group-hover:text-[#8B5CF6] transition-colors">
              Microsoft Outlook
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[#8B5CF6]/60 font-medium">
              Connect
            </span>
          </motion.div>
        </a>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Day View
// ---------------------------------------------------------------------------

function DayView({
  date,
  events,
  conflicts,
  onEventClick,
}: {
  date: Date;
  events: CalendarEvent[];
  conflicts: ConflictPair[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const dayEvents = getEventsForDay(events, date);

  return (
    <motion.div
      key="day-view"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className="flex overflow-auto"
      style={{ maxHeight: TOTAL_HOURS * HOUR_HEIGHT + 40 }}
    >
      <TimeGutter />
      <div className="flex-1 relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
        <TimeGridLines />

        {/* Now indicator */}
        {isToday(date) && <NowIndicator />}

        <AnimatePresence>
          {dayEvents.map((event) => {
            const { top, height } = getEventPosition(event);
            const conflict = isEventInConflict(event.id, conflicts);
            return (
              <EventBlock
                key={event.id}
                event={event}
                hasConflict={conflict}
                onClick={() => onEventClick(event)}
                style={{ top, height, zIndex: conflict ? 10 : 1 }}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Week View
// ---------------------------------------------------------------------------

function WeekView({
  date,
  events,
  conflicts,
  onEventClick,
}: {
  date: Date;
  events: CalendarEvent[];
  conflicts: ConflictPair[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <motion.div
      key="week-view"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Day headers */}
      <div className="flex ml-16 mb-2 border-b border-[#1A2035]/40 pb-2">
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`flex-1 text-center text-xs font-medium uppercase tracking-wider ${
              isToday(day) ? 'text-[#00D4FF]' : 'text-white/40'
            }`}
          >
            <div>{format(day, 'EEE')}</div>
            <div
              className={`
                inline-flex items-center justify-center w-7 h-7 rounded-full mt-1 text-sm font-semibold
                ${isToday(day) ? 'bg-[#00D4FF]/20 text-[#00D4FF] shadow-[0_0_12px_rgba(0,212,255,0.3)]' : 'text-white/70'}
              `}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex overflow-auto" style={{ maxHeight: TOTAL_HOURS * HOUR_HEIGHT + 20 }}>
        <TimeGutter />
        <div className="flex-1 flex">
          {days.map((day) => {
            const dayEvents = getEventsForDay(events, day);
            return (
              <div
                key={day.toISOString()}
                className={`
                  flex-1 relative border-r border-[#1A2035]/30 last:border-r-0
                  ${isToday(day) ? 'bg-[#00D4FF]/[0.02]' : ''}
                `}
                style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
              >
                <TimeGridLines />
                {isToday(day) && <NowIndicator />}

                <AnimatePresence>
                  {dayEvents.map((event) => {
                    const { top, height } = getEventPosition(event);
                    const conflict = isEventInConflict(event.id, conflicts);
                    return (
                      <EventBlock
                        key={event.id}
                        event={event}
                        hasConflict={conflict}
                        compact
                        onClick={() => onEventClick(event)}
                        style={{ top, height, zIndex: conflict ? 10 : 1 }}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Month View
// ---------------------------------------------------------------------------

function MonthView({
  date,
  events,
  conflicts,
  onEventClick,
}: {
  date: Date;
  events: CalendarEvent[];
  conflicts: ConflictPair[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  // Build weeks
  const weeks: Date[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <motion.div
      key="month-view"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayHeaders.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-widest text-white/30 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 border-t border-l border-[#1A2035]/40">
        {weeks.flat().map((day) => {
          const dayEvents = getEventsForDay(events, day);
          const inMonth = isSameMonth(day, date);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`
                relative min-h-[100px] border-r border-b border-[#1A2035]/40 p-1.5
                transition-colors duration-200
                ${!inMonth ? 'opacity-30' : ''}
                ${today ? 'bg-[#00D4FF]/[0.04] ring-1 ring-inset ring-[#00D4FF]/20' : 'hover:bg-white/[0.02]'}
              `}
            >
              {/* Day number */}
              <div
                className={`
                  text-xs font-medium mb-1
                  ${today ? 'text-[#00D4FF] font-semibold' : 'text-white/50'}
                `}
              >
                <span
                  className={`
                    inline-flex items-center justify-center w-6 h-6 rounded-full
                    ${today ? 'bg-[#00D4FF]/20 shadow-[0_0_10px_rgba(0,212,255,0.25)]' : ''}
                  `}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* Event pills (max 3 visible) */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <MonthEventPill
                    key={event.id}
                    event={event}
                    hasConflict={isEventInConflict(event.id, conflicts)}
                    onClick={() => onEventClick(event)}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-white/30 font-medium px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Now Indicator
// ---------------------------------------------------------------------------

function NowIndicator() {
  const now = new Date();
  const currentHour = getHours(now) + getMinutes(now) / 60;

  if (currentHour < HOUR_START || currentHour > HOUR_END) return null;

  const top = (currentHour - HOUR_START) * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top }}>
      <div className="relative">
        <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-[#FF3B3B] shadow-[0_0_8px_rgba(255,59,59,0.6)]" />
        <div className="h-[1.5px] bg-[#FF3B3B]/70 shadow-[0_0_6px_rgba(255,59,59,0.4)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  const [connections, setConnections] = useState<Array<{ provider: string; connected: boolean }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Compute the date range we need to fetch based on view
  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    switch (view) {
      case 'day':
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
        break;
      case 'week':
        start = startOfWeek(currentDate, { weekStartsOn: 0 });
        end = endOfWeek(currentDate, { weekStartsOn: 0 });
        break;
      case 'month':
      default:
        start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
        end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
        break;
    }

    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    };
  }, [view, currentDate]);

  // Date range display label
  const dateLabel = useMemo(() => {
    switch (view) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
        const we = endOfWeek(currentDate, { weekStartsOn: 0 });
        if (ws.getMonth() === we.getMonth()) {
          return `${format(ws, 'MMMM d')} - ${format(we, 'd, yyyy')}`;
        }
        return `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`;
      }
      case 'month':
        return format(currentDate, 'MMMM yyyy');
      default:
        return '';
    }
  }, [view, currentDate]);

  // Fetch calendar connections on mount
  useEffect(() => {
    calendar.getConnections().then((conns) => {
      setConnections(Array.isArray(conns) ? conns : []);
    }).catch(() => {
      setConnections([]);
    });
  }, []);

  // Fetch events whenever date range changes
  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setLoading(true);
      try {
        const [eventsData, conflictsData] = await Promise.all([
          calendar.getEvents({ startDate: dateRange.start, endDate: dateRange.end }),
          calendar.getConflicts(),
        ]);
        if (!cancelled) {
          setEvents(Array.isArray(eventsData) ? eventsData : []);
          setConflicts(Array.isArray(conflictsData) ? conflictsData : []);
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
          setConflicts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEvents();
    return () => {
      cancelled = true;
    };
  }, [dateRange.start, dateRange.end]);

  // Navigation handlers
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const goPrev = useCallback(() => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'day':
          return subDays(prev, 1);
        case 'week':
          return subWeeks(prev, 1);
        case 'month':
          return subMonths(prev, 1);
      }
    });
  }, [view]);

  const goNext = useCallback(() => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'day':
          return addDays(prev, 1);
        case 'week':
          return addWeeks(prev, 1);
        case 'month':
          return addMonths(prev, 1);
      }
    });
  }, [view]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setModalOpen(true);
  }, []);

  // Determine if calendars are connected
  const hasConnections = connections === null
    ? true // still loading, assume connected to avoid flash
    : connections.some((c) => c.connected);

  // Conflict count
  const conflictCount = conflicts.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <Calendar className="w-6 h-6 text-[#00D4FF]" />
            Calendar
          </h1>
          <p className="text-sm text-white/30 mt-1">Unified scheduling intelligence</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {conflictCount > 0 && (
            <GlowBadge status="danger" label="Conflicts" value={String(conflictCount)} />
          )}
          <ViewToggle view={view} onChange={setView} />
        </div>
      </motion.div>

      {/* Calendar Panel */}
      <HudPanel delay={0.1}>
        {/* Navigation bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button variant="ghost" size="sm" onClick={goNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <motion.h2
            key={dateLabel}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-sm font-semibold text-white/80 tracking-wide"
          >
            {dateLabel}
          </motion.h2>

          {/* Source legend */}
          <div className="hidden md:flex items-center gap-4 text-[10px] font-medium uppercase tracking-wider text-white/30">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00D4FF]" />
              Google
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
              Outlook
            </span>
          </div>
        </div>

        {/* Content */}
        {!hasConnections ? (
          <EmptyState />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-2 border-[#00D4FF]/20 border-t-[#00D4FF] rounded-full"
            />
            <p className="text-xs text-white/30 mt-4 uppercase tracking-wider">
              Synchronizing calendar feeds...
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {view === 'day' && (
              <DayView
                date={currentDate}
                events={events}
                conflicts={conflicts}
                onEventClick={handleEventClick}
              />
            )}
            {view === 'week' && (
              <WeekView
                date={currentDate}
                events={events}
                conflicts={conflicts}
                onEventClick={handleEventClick}
              />
            )}
            {view === 'month' && (
              <MonthView
                date={currentDate}
                events={events}
                conflicts={conflicts}
                onEventClick={handleEventClick}
              />
            )}
          </AnimatePresence>
        )}
      </HudPanel>

      {/* Conflicts Panel */}
      {conflictCount > 0 && (
        <HudPanel title="Schedule Conflicts" delay={0.2}>
          <div className="space-y-3">
            {conflicts.map((c, i) => {
              const e1Start = parseISO(c.event1.startTime);
              const e2Start = parseISO(c.event2.startTime);
              const s1 = SOURCE_COLORS[c.event1.source] || SOURCE_COLORS.manual;
              const s2 = SOURCE_COLORS[c.event2.source] || SOURCE_COLORS.manual;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg border border-[#FF3B3B]/20 bg-[#FF3B3B]/[0.04]"
                >
                  <AlertTriangle className="w-4 h-4 text-[#FF3B3B] flex-shrink-0" />

                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => handleEventClick(c.event1)}
                      className="text-left hover:bg-white/5 rounded px-2 py-1 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${s1.dot}`} />
                        <span className="text-sm text-white/80 font-medium truncate">{c.event1.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/30">{format(e1Start, 'h:mm a')}</span>
                    </button>

                    <button
                      onClick={() => handleEventClick(c.event2)}
                      className="text-left hover:bg-white/5 rounded px-2 py-1 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${s2.dot}`} />
                        <span className="text-sm text-white/80 font-medium truncate">{c.event2.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/30">{format(e2Start, 'h:mm a')}</span>
                    </button>
                  </div>

                  <GlowBadge status="danger" label="Conflict" />
                </motion.div>
              );
            })}
          </div>
        </HudPanel>
      )}

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
}

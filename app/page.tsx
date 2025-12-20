"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type View = "home" | "categories" | "setup" | "game" | "results";

type CategoryId = "puzzle" | "box" | "brain";

type Difficulty = "easy" | "medium" | "hard";
type TimeMode = 30 | 60 | 180 | "endless";

type PuzzleGameId = "number_match" | "equation_builder";
type BrainGameId = "pattern_finder";
type BoxGameId = "box_merge";

type GameId = PuzzleGameId | BrainGameId | BoxGameId;

type GameCategory = {
  id: CategoryId;
  name: string;
  description: string;
  difficulty: "Easy → Hard" | "Hard" | "Easy → Medium";
  examples: string[];
  accent: {
    from: string;
    to: string;
    ring: string;
    chip: string;
  };
  badge?: "Recommended" | "Advanced";
  icon: React.ReactNode;
};

type GameSummary = {
  categoryId: CategoryId;
  gameId: GameId;
  difficulty: Difficulty;
  timeMode: TimeMode;
  score: number;
  correct: number;
  total: number;
  secondsPlayed: number;
  endedBy: "timer" | "full" | "quit" | "finish";
};

// -------------------- Local storage (Step 4) --------------------
const LS_SETTINGS_KEY = "mindarcade_settings_v1";
const LS_PROGRESS_KEY = "mindarcade_progress_v1";
const LS_SESSION_KEY = "mindarcade_session_v1";

type StoredSettings = {
  categoryId: CategoryId;
  gameId: GameId;
  difficulty: Difficulty;
  timeMode: TimeMode;
};

type ScoreEntry = {
  ts: number;
  score: number;
  correct: number;
  total: number;
  secondsPlayed: number;
};

type StoredProgress = Partial<
  Record<
    GameId,
    {
      bestScore: number;
      last10: ScoreEntry[];
    }
  >
>;

type NumberMatchState = { kind: "number_match"; round: NumberMatchRound; selected: number[] };
type EquationBuilderState = { kind: "equation_builder"; target: number; tokens: EqToken[] };
type PatternFinderState = { kind: "pattern_finder"; round: PatternRound };
type BoxMergeState = {
  kind: "box_merge";
  size: number;
  grid: Cell[];
  nextLevel: number;
};

type GameSpecificState =
  | NumberMatchState
  | EquationBuilderState
  | PatternFinderState
  | BoxMergeState;

type StoredSession = {
  active: boolean;
  categoryId: CategoryId;
  gameId: GameId;
  difficulty: Difficulty;
  timeMode: TimeMode;
  score: number;
  correct: number;
  total: number;
  secondsLeft: number;
  elapsedSeconds: number;
  running: boolean;
  view: View;
  updatedAt: number;
  gameState: GameSpecificState | null;
};

function safeParseJSON<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function lsGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  return safeParseJSON<T>(raw);
}

function lsSet<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function lsRemove(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function percent(numer: number, denom: number) {
  if (denom <= 0) return 0;
  return Math.round((numer / denom) * 100);
}

function gameTitle(categoryId: CategoryId, gameId: GameId) {
  if (categoryId === "puzzle") {
    return gameId === "equation_builder" ? "Equation Builder" : "Number Match";
  }
  if (categoryId === "brain") return "Pattern Finder";
  return "Box Merge";
}

function IconPuzzle(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.4 6.2a2.2 2.2 0 1 1 4.4 0v.9h.8a2.2 2.2 0 1 1 0 4.4h-.8v.9a2.2 2.2 0 1 1-4.4 0v-.9h-.8a2.2 2.2 0 1 1 0-4.4h.8v-.9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 19.2h9.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBox(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2.8 20 7.2v9.6l-8 4.4-8-4.4V7.2l8-4.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 2.8v9.2l8-4.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 12 4 7.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBrain(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.2 6.2a3.2 3.2 0 0 1 6.2 1.1 2.7 2.7 0 0 1 1.5 4.8 3.1 3.1 0 0 1-.8 5.9H9a3.1 3.1 0 0 1-1.2-6 2.7 2.7 0 0 1 1.4-4.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 6v12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Pill(props: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        "border border-white/10 bg-white/5 text-white/80 backdrop-blur",
        props.className
      )}
    >
      {props.children}
    </span>
  );
}

function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; sub?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-white/90">{props.label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {props.options.map((opt) => {
          const active = opt.value === props.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => props.onChange(opt.value)}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left transition",
                "border-white/10 bg-white/5 hover:bg-white/8",
                active && "border-white/25 bg-white/10"
              )}
            >
              <div className="text-sm font-semibold">{opt.label}</div>
              {opt.sub ? (
                <div className="mt-0.5 text-xs text-white/60">{opt.sub}</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryCard(props: {
  category: GameCategory;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { category, selected } = props;

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border text-left outline-none",
        "border-white/10 bg-white/5 backdrop-blur transition",
        "hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/8",
        "focus-visible:ring-2 focus-visible:ring-white/40",
        selected && "ring-2 ring-white/35"
      )}
    >
      <div
        className={cn(
          "absolute inset-0 opacity-80 blur-2xl transition group-hover:opacity-100",
          `bg-gradient-to-br ${category.accent.from} ${category.accent.to}`
        )}
      />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl",
                "border border-white/10 bg-white/10 text-white"
              )}
            >
              {category.icon}
            </span>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  {category.name}
                </h3>
                {category.badge ? (
                  <Pill className="border-white/10 bg-white/10 text-white/85">
                    {category.badge}
                  </Pill>
                ) : null}
              </div>

              <p className="mt-1 text-sm text-white/70">
                {category.description}
              </p>
            </div>
          </div>

          <Pill className={cn("bg-white/10", category.accent.ring)}>
            {category.difficulty}
          </Pill>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {category.examples.map((ex) => (
            <span
              key={ex}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs",
                "border border-white/10 bg-white/10 text-white/80",
                category.accent.chip
              )}
            >
              {ex}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-white/60">
            No login • Instant play
          </span>
          <span className="text-sm font-semibold text-white">Choose →</span>
        </div>
      </div>
    </button>
  );
}

function GameShell(props: {
  title: string;
  difficulty: Difficulty;
  timeMode: TimeMode;
  running: boolean;
  timeLabel: string;
  score: number;
  correct: number;
  total: number;
  onQuit: () => void;
  onFinish?: () => void;
  children: React.ReactNode;
}) {
  const showAccuracy = props.total > 0;
  const accuracyLabel = percent(props.correct, props.total);

  return (
    <section className="pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill className="bg-white/8">{props.title}</Pill>
          <Pill className="bg-white/6 capitalize">{props.difficulty}</Pill>
          <Pill className="bg-white/6">
            {props.timeMode === "endless" ? "Endless" : "Timed"}
          </Pill>
          {showAccuracy ? (
            <Pill className="bg-white/6">Accuracy {accuracyLabel}%</Pill>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
            <div className="text-[11px] text-white/60">Time</div>
            <div className="text-sm font-semibold tabular-nums">
              {props.timeLabel}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
            <div className="text-[11px] text-white/60">Score</div>
            <div className="text-sm font-semibold tabular-nums">
              {props.score}
            </div>
          </div>

          {props.timeMode === "endless" && props.onFinish ? (
            <button
              type="button"
              onClick={props.onFinish}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Finish
            </button>
          ) : null}

          <button
            type="button"
            onClick={props.onQuit}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/8"
          >
            Quit
          </button>
        </div>
      </div>

      {props.children}
    </section>
  );
}

/* --------------------------- Puzzle: Number Match -------------------------- */

type NumberMatchRound = {
  target: number;
  numbers: number[];
};

function makeNumberMatchRound(difficulty: Difficulty): NumberMatchRound {
  const config =
    difficulty === "easy"
      ? { tiles: 12, min: 1, max: 9, pickMin: 2, pickMax: 3 }
      : difficulty === "medium"
        ? { tiles: 12, min: 2, max: 12, pickMin: 2, pickMax: 4 }
        : { tiles: 15, min: 5, max: 20, pickMin: 3, pickMax: 5 };

  const numbers = Array.from({ length: config.tiles }, () =>
    Math.floor(Math.random() * (config.max - config.min + 1)) + config.min
  );

  const pickCount =
    Math.floor(Math.random() * (config.pickMax - config.pickMin + 1)) +
    config.pickMin;

  // Ensure solvable: target is sum of a random subset from the board.
  const idxs = new Set<number>();
  while (idxs.size < pickCount) idxs.add(Math.floor(Math.random() * numbers.length));

  let target = 0;
  idxs.forEach((i) => (target += numbers[i]!));

  target = clamp(target, config.min * 2, config.max * config.pickMax);

  return { target, numbers };
}

function PuzzleNumberMatch(props: {
  difficulty: Difficulty;
  running: boolean;
  state: NumberMatchState;
  setState: (next: NumberMatchState) => void;
  onScore: (delta: number) => void;
  onAttempt: (correct: boolean) => void;
}) {
  const selectedSet = useMemo(() => new Set(props.state.selected), [props.state.selected]);

  const selectedSum = useMemo(() => {
    let sum = 0;
    for (const i of props.state.selected) sum += props.state.round.numbers[i] ?? 0;
    return sum;
  }, [props.state.selected, props.state.round.numbers]);

  useEffect(() => {
    // If difficulty changed while in-game, reset round safely
    // (keeps step 4 "persistence" consistent with current settings).
    props.setState({
      kind: "number_match",
      round: makeNumberMatchRound(props.difficulty),
      selected: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.difficulty]);

  function toggleIndex(i: number) {
    if (!props.running) return;

    const nextSelected = selectedSet.has(i)
      ? props.state.selected.filter((x) => x !== i)
      : [...props.state.selected, i];

    const nextSum = nextSelected.reduce(
      (acc, idx) => acc + (props.state.round.numbers[idx] ?? 0),
      0
    );

    if (nextSum === props.state.round.target) {
      props.onAttempt(true);
      props.onScore(1);
      props.setState({
        kind: "number_match",
        round: makeNumberMatchRound(props.difficulty),
        selected: [],
      });
      return;
    }

    if (nextSum > props.state.round.target) {
      props.onAttempt(false);
      props.setState({ ...props.state, selected: [] });
      return;
    }

    props.setState({ ...props.state, selected: nextSelected });
  }

  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">Target</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              {props.state.round.target}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-white/60">Selected sum</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums transition">
              {selectedSum}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {props.state.round.numbers.map((n, i) => {
            const isSelected = selectedSet.has(i);
            return (
              <button
                key={`${n}-${i}`}
                type="button"
                onClick={() => toggleIndex(i)}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-center text-base font-semibold",
                  "transition active:scale-[0.98]",
                  isSelected
                    ? "border-white/25 bg-white/15"
                    : "border-white/10 bg-white/5 hover:bg-white/8"
                )}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-white/60">
          Tap numbers to match the target sum. Overshoot clears the selection.
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Puzzle: Equation Builder ------------------------ */

type EqToken = number | "+" | "-";

function tokensToString(tokens: EqToken[]) {
  return tokens.map((t) => (typeof t === "number" ? String(t) : t)).join(" ");
}

function evalTokens(tokens: EqToken[]) {
  // Only supports: number (op number)* with +/-
  if (tokens.length === 0) return null;
  if (typeof tokens[0] !== "number") return null;
  if (typeof tokens[tokens.length - 1] !== "number") return null;

  let acc = tokens[0];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const rhs = tokens[i + 1];
    if ((op !== "+" && op !== "-") || typeof rhs !== "number") return null;
    acc = op === "+" ? acc + rhs : acc - rhs;
  }
  return acc;
}

function makeEquationTarget(difficulty: Difficulty) {
  if (difficulty === "easy") return Math.floor(Math.random() * 14) + 6; // 6..19
  if (difficulty === "medium") return Math.floor(Math.random() * 26) + 10; // 10..35
  return Math.floor(Math.random() * 51) + 15; // 15..65
}

function PuzzleEquationBuilder(props: {
  difficulty: Difficulty;
  running: boolean;
  state: EquationBuilderState;
  setState: (next: EquationBuilderState) => void;
  onScore: (delta: number) => void;
  onAttempt: (correct: boolean) => void;
}) {
  const maxTokens =
    props.difficulty === "easy" ? 5 : props.difficulty === "medium" ? 7 : 9;

  const value = useMemo(() => evalTokens(props.state.tokens), [props.state.tokens]);

  useEffect(() => {
    props.setState({
      kind: "equation_builder",
      target: makeEquationTarget(props.difficulty),
      tokens: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.difficulty]);

  function pushNumber(n: number) {
    if (!props.running) return;
    if (props.state.tokens.length >= maxTokens) return;

    const last = props.state.tokens[props.state.tokens.length - 1];
    if (props.state.tokens.length === 0 || last === "+" || last === "-") {
      props.setState({ ...props.state, tokens: [...props.state.tokens, n] });
    } else {
      props.onAttempt(false);
    }
  }

  function pushOp(op: "+" | "-") {
    if (!props.running) return;
    if (props.state.tokens.length >= maxTokens) return;

    const last = props.state.tokens[props.state.tokens.length - 1];
    if (typeof last === "number") {
      props.setState({ ...props.state, tokens: [...props.state.tokens, op] });
    } else {
      props.onAttempt(false);
    }
  }

  function backspace() {
    if (!props.running) return;
    props.setState({ ...props.state, tokens: props.state.tokens.slice(0, -1) });
  }

  function clear() {
    if (!props.running) return;
    props.setState({ ...props.state, tokens: [] });
  }

  useEffect(() => {
    if (!props.running) return;
    if (value === null) return;

    if (value === props.state.target) {
      props.onAttempt(true);
      props.onScore(1);
      props.setState({
        kind: "equation_builder",
        target: makeEquationTarget(props.difficulty),
        tokens: [],
      });
    }
  }, [value, props.running, props.state.target, props.difficulty, props.onAttempt, props.onScore, props.setState]);

  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">Target</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              {props.state.target}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-white/60">Value</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums transition">
              {value ?? "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs text-white/60">Your equation</div>
          <div className="mt-1 min-h-7 text-lg font-semibold">
            {props.state.tokens.length ? (
              tokensToString(props.state.tokens)
            ) : (
              <span className="text-white/40">Tap numbers and +/−</span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-9">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => pushNumber(n)}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center text-base font-semibold transition hover:bg-white/8 active:scale-[0.98]"
            >
              {n}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => pushOp("+")}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold transition hover:bg-white/8"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => pushOp("-")}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold transition hover:bg-white/8"
          >
            −
          </button>
          <button
            type="button"
            onClick={backspace}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold transition hover:bg-white/8"
          >
            Backspace
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold transition hover:bg-white/8"
          >
            Clear
          </button>
        </div>

        <div className="mt-4 text-xs text-white/60">
          Build an equation using single digits and +/− to hit the target.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Brain: Pattern Finder ---------------------------- */

type PatternRound = {
  size: number;
  oddIndex: number;
  hue: number;
  delta: number;
};

function makePatternRound(difficulty: Difficulty): PatternRound {
  const size = difficulty === "easy" ? 4 : difficulty === "medium" ? 5 : 6;
  const tileCount = size * size;
  const oddIndex = Math.floor(Math.random() * tileCount);
  const hue = Math.floor(Math.random() * 360);
  const delta = difficulty === "easy" ? 12 : difficulty === "medium" ? 10 : 8; // smaller difference is harder
  return { size, oddIndex, hue, delta };
}

function BrainPatternFinder(props: {
  difficulty: Difficulty;
  running: boolean;
  state: PatternFinderState;
  setState: (next: PatternFinderState) => void;
  onScore: (delta: number) => void;
  onAttempt: (correct: boolean) => void;
}) {
  useEffect(() => {
    props.setState({ kind: "pattern_finder", round: makePatternRound(props.difficulty) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.difficulty]);

  function onPick(i: number) {
    if (!props.running) return;
    const ok = i === props.state.round.oddIndex;
    props.onAttempt(ok);
    if (ok) props.onScore(1);
    props.setState({ kind: "pattern_finder", round: makePatternRound(props.difficulty) });
  }

  const tiles = Array.from(
    { length: props.state.round.size * props.state.round.size },
    (_, i) => i
  );

  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">Goal</div>
            <div className="mt-1 text-lg font-semibold">Find the odd tile</div>
          </div>
          <div className="text-sm font-semibold text-white/60">Tap quickly</div>
        </div>

        <div
          className="mt-4 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${props.state.round.size}, minmax(0, 1fr))`,
          }}
        >
          {tiles.map((i) => {
            const isOdd = i === props.state.round.oddIndex;
            const l = isOdd ? 62 + props.state.round.delta : 62;
            const bg = `hsl(${props.state.round.hue} 70% ${l}%)`;

            return (
              <button
                key={i}
                type="button"
                onClick={() => onPick(i)}
                className={cn(
                  "aspect-square rounded-2xl border transition active:scale-[0.98]",
                  "border-white/10 hover:border-white/20"
                )}
                style={{ backgroundColor: bg }}
                aria-label="Pattern tile"
              />
            );
          })}
        </div>

        <div className="mt-4 text-xs text-white/60">
          The color difference gets smaller as difficulty increases.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Box: Box Merge ------------------------------ */

type Cell = number | null; // level

function makeNextLevel(difficulty: Difficulty) {
  if (difficulty === "easy") return Math.random() < 0.75 ? 1 : 2;
  if (difficulty === "medium") return Math.random() < 0.55 ? 1 : 2 + (Math.random() < 0.35 ? 1 : 0); // 1..3
  return Math.random() < 0.35 ? 2 : 3; // 2..3
}

function levelToScore(level: number) {
  // modest curve
  return Math.pow(2, clamp(level, 1, 12));
}

function BoxMerge(props: {
  difficulty: Difficulty;
  running: boolean;
  state: BoxMergeState;
  setState: (next: BoxMergeState) => void;
  onScore: (delta: number) => void;
  onAttempt: (correct: boolean) => void; // "efficiency": merge happened or not
  onGameOver: (reason: "full") => void;
}) {
  useEffect(() => {
    const size = props.difficulty === "hard" ? 5 : 4;
    props.setState({
      kind: "box_merge",
      size,
      grid: Array.from({ length: size * size }, () => null),
      nextLevel: makeNextLevel(props.difficulty),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.difficulty]);

  const size = props.state.size;

  function idx(r: number, c: number) {
    return r * size + c;
  }

  function neighbors(i: number) {
    const r = Math.floor(i / size);
    const c = i % size;
    const list: number[] = [];
    if (r > 0) list.push(idx(r - 1, c));
    if (r < size - 1) list.push(idx(r + 1, c));
    if (c > 0) list.push(idx(r, c - 1));
    if (c < size - 1) list.push(idx(r, c + 1));
    return list;
  }

  function placeAt(i: number) {
    if (!props.running) return;
    if (props.state.grid[i] !== null) return;

    const nextGrid = props.state.grid.slice();
    nextGrid[i] = props.state.nextLevel;

    let mergedAny = false;
    let cursor = i;

    while (true) {
      const curLevel = nextGrid[cursor];
      if (curLevel === null) break;

      const sameNeighbor = neighbors(cursor).find((n) => nextGrid[n] === curLevel);
      if (sameNeighbor === undefined) break;

      nextGrid[sameNeighbor] = null;
      nextGrid[cursor] = curLevel + 1;
      mergedAny = true;

      props.onScore(levelToScore(curLevel + 1));
    }

    props.onAttempt(mergedAny);

    const nextState: BoxMergeState = {
      kind: "box_merge",
      size,
      grid: nextGrid,
      nextLevel: makeNextLevel(props.difficulty),
    };
    props.setState(nextState);

    const hasEmpty = nextGrid.some((c) => c === null);
    if (!hasEmpty) props.onGameOver("full");
  }

  function levelColor(level: number) {
    // stable palette
    const hue = (220 + level * 24) % 360;
    const l = clamp(70 - level * 2, 42, 72);
    return `hsl(${hue} 75% ${l}%)`;
  }

  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">Next block</div>
            <div className="mt-2 inline-flex items-center gap-2">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-sm font-bold text-black"
                style={{ backgroundColor: levelColor(props.state.nextLevel) }}
              >
                {props.state.nextLevel}
              </span>
              <div className="text-sm text-white/70">
                Place it. Matching neighbors merge and level up.
              </div>
            </div>
          </div>
          <div className="text-sm font-semibold text-white/60">
            Grid {size}×{size}
          </div>
        </div>

        <div
          className="mt-4 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {props.state.grid.map((cell, i) => {
            const isEmpty = cell === null;
            return (
              <button
                key={i}
                type="button"
                onClick={() => placeAt(i)}
                className={cn(
                  "aspect-square rounded-2xl border transition active:scale-[0.98]",
                  isEmpty
                    ? "border-white/10 bg-white/5 hover:bg-white/8"
                    : "border-white/10"
                )}
                style={
                  isEmpty
                    ? undefined
                    : { backgroundColor: levelColor(cell), color: "black" }
                }
                aria-label={isEmpty ? "Empty cell" : `Level ${cell}`}
              >
                <span className={cn("text-base font-bold", isEmpty && "text-white/20")}>
                  {isEmpty ? "·" : cell}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-white/60">
          Efficiency is tracked as: placements that cause a merge.
        </div>
      </div>
    </div>
  );
}

function makeInitialGameState(
  categoryId: CategoryId,
  gameId: GameId,
  difficulty: Difficulty
): GameSpecificState {
  if (categoryId === "puzzle") {
    if (gameId === "equation_builder") {
      return { kind: "equation_builder", target: makeEquationTarget(difficulty), tokens: [] };
    }
    return { kind: "number_match", round: makeNumberMatchRound(difficulty), selected: [] };
  }
  if (categoryId === "brain") {
    return { kind: "pattern_finder", round: makePatternRound(difficulty) };
  }
  // box
  const size = difficulty === "hard" ? 5 : 4;
  return {
    kind: "box_merge",
    size,
    grid: Array.from({ length: size * size }, () => null),
    nextLevel: makeNextLevel(difficulty),
  };
}

/* ----------------------------------- App ---------------------------------- */

export default function Home() {
  const [view, setView] = useState<View>("home");

  const [selectedCategoryId, setSelectedCategoryId] = useState<CategoryId | null>(null);

  // Setup (step 3)
  const [timeMode, setTimeMode] = useState<TimeMode>(30);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [selectedGameId, setSelectedGameId] = useState<GameId>("number_match");

  // Runtime
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [correct, setCorrect] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [summary, setSummary] = useState<GameSummary | null>(null);

  // Game-specific state (persistable)
  const [gameState, setGameState] = useState<GameSpecificState | null>(null);

  // Progress UI
  const [progressOpen, setProgressOpen] = useState<boolean>(false);
  const [progress, setProgress] = useState<StoredProgress>({});

  // Resume UI
  const [resumeSession, setResumeSession] = useState<StoredSession | null>(null);

  const timerIdRef = useRef<number | null>(null);
  const latestRef = useRef<{
    selectedCategoryId: CategoryId | null;
    selectedGameId: GameId;
    difficulty: Difficulty;
    timeMode: TimeMode;
    score: number;
    correct: number;
    total: number;
    secondsLeft: number;
    elapsedSeconds: number;
    gameState: GameSpecificState | null;
    view: View;
    running: boolean;
  }>({
    selectedCategoryId: null,
    selectedGameId: "number_match",
    difficulty: "easy",
    timeMode: 30,
    score: 0,
    correct: 0,
    total: 0,
    secondsLeft: 30,
    elapsedSeconds: 0,
    gameState: null,
    view: "home",
    running: false,
  });

  useEffect(() => {
    latestRef.current = {
      selectedCategoryId,
      selectedGameId,
      difficulty,
      timeMode,
      score,
      correct,
      total,
      secondsLeft,
      elapsedSeconds,
      gameState,
      view,
      running,
    };
  }, [
    selectedCategoryId,
    selectedGameId,
    difficulty,
    timeMode,
    score,
    correct,
    total,
    secondsLeft,
    elapsedSeconds,
    gameState,
    view,
    running,
  ]);

  // Load settings/progress/session on first mount
  useEffect(() => {
    const s = lsGet<StoredSettings>(LS_SETTINGS_KEY);
    if (s) {
      setSelectedCategoryId(s.categoryId);
      setSelectedGameId(s.gameId);
      setDifficulty(s.difficulty);
      setTimeMode(s.timeMode);
    }

    const p = lsGet<StoredProgress>(LS_PROGRESS_KEY);
    if (p) setProgress(p);

    const sess = lsGet<StoredSession>(LS_SESSION_KEY);
    if (sess?.active) {
      // ignore very old sessions
      const ageMs = Date.now() - (sess.updatedAt ?? 0);
      if (ageMs < 1000 * 60 * 60 * 6) setResumeSession(sess);
      else lsRemove(LS_SESSION_KEY);
    }
  }, []);

  // Persist settings when changed (only when not actively playing)
  useEffect(() => {
    if (!selectedCategoryId) return;
    if (running) return;
    const s: StoredSettings = {
      categoryId: selectedCategoryId,
      gameId: selectedGameId,
      difficulty,
      timeMode,
    };
    lsSet(LS_SETTINGS_KEY, s);
  }, [selectedCategoryId, selectedGameId, difficulty, timeMode, running]);

  // Persist session while playing
  const persistTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;

    if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = window.setTimeout(() => {
      const snap = latestRef.current;
      const categoryId = snap.selectedCategoryId ?? "puzzle";

      const sess: StoredSession = {
        active: true,
        categoryId,
        gameId: snap.selectedGameId,
        difficulty: snap.difficulty,
        timeMode: snap.timeMode,
        score: snap.score,
        correct: snap.correct,
        total: snap.total,
        secondsLeft: snap.secondsLeft,
        elapsedSeconds: snap.elapsedSeconds,
        running: snap.running,
        view: snap.view,
        updatedAt: Date.now(),
        gameState: snap.gameState,
      };

      lsSet(LS_SESSION_KEY, sess);
      setResumeSession(sess);
    }, 250);

    return () => {
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [running, score, correct, total, secondsLeft, elapsedSeconds, gameState, view]);

  const categories: GameCategory[] = useMemo(
    () => [
      {
        id: "puzzle",
        name: "Puzzle Games",
        description: "Simple tasks + math concepts to sharpen speed and accuracy.",
        difficulty: "Easy → Medium",
        examples: ["Number Match", "Equation Builder", "Shape Fit"],
        badge: "Recommended",
        accent: {
          from: "from-sky-500/25",
          to: "to-emerald-400/15",
          ring: "ring-sky-300/30",
          chip: "hover:border-sky-200/25",
        },
        icon: <IconPuzzle className="h-5 w-5" />,
      },
      {
        id: "box",
        name: "Box Creating Games",
        description: "Hard-mode construction and constraints for advanced players.",
        difficulty: "Hard",
        examples: ["Box Merge", "Shape Constructor", "Constraint Builder"],
        badge: "Advanced",
        accent: {
          from: "from-fuchsia-500/25",
          to: "to-cyan-300/10",
          ring: "ring-fuchsia-300/25",
          chip: "hover:border-fuchsia-200/20",
        },
        icon: <IconBox className="h-5 w-5" />,
      },
      {
        id: "brain",
        name: "Brain Games",
        description: "Memory, patterns, and logic—fast rounds, clean UI.",
        difficulty: "Easy → Hard",
        examples: ["Pattern Finder", "Memory Flip", "Logic Grid"],
        accent: {
          from: "from-violet-500/25",
          to: "to-orange-400/10",
          ring: "ring-violet-300/25",
          chip: "hover:border-violet-200/20",
        },
        icon: <IconBrain className="h-5 w-5" />,
      },
    ],
    []
  );

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const gameOptions: Array<{ id: GameId; label: string; desc: string; categoryId: CategoryId }> =
    useMemo(
      () => [
        { id: "number_match", label: "Number Match", desc: "Tap numbers to match the target sum.", categoryId: "puzzle" },
        { id: "equation_builder", label: "Equation Builder", desc: "Use digits and +/− to hit the target.", categoryId: "puzzle" },
        { id: "pattern_finder", label: "Pattern Finder", desc: "Find the odd tile as fast as you can.", categoryId: "brain" },
        { id: "box_merge", label: "Box Merge", desc: "Place blocks; matching neighbors merge and level up.", categoryId: "box" },
      ],
      []
    );

  const visibleGames = useMemo(() => {
    const cat = selectedCategoryId ?? "puzzle";
    return gameOptions.filter((g) => g.categoryId === cat);
  }, [gameOptions, selectedCategoryId]);

  // keep selectedGameId valid when category changes
  useEffect(() => {
    if (!selectedCategoryId) return;
    const first = gameOptions.find((g) => g.categoryId === selectedCategoryId);
    if (!first) return;
    const stillValid = gameOptions.some(
      (g) => g.categoryId === selectedCategoryId && g.id === selectedGameId
    );
    if (!stillValid) setSelectedGameId(first.id);
  }, [selectedCategoryId, gameOptions, selectedGameId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  function secondsPlayedNowFromSnap(snap: typeof latestRef.current) {
    if (snap.timeMode === "endless") return snap.elapsedSeconds;
    const totalSeconds = typeof snap.timeMode === "number" ? snap.timeMode : 0;
    return clamp(totalSeconds - snap.secondsLeft, 0, totalSeconds);
  }

  function endGame(reason: GameSummary["endedBy"]) {
    const snap = latestRef.current;
    const categoryId = snap.selectedCategoryId ?? "puzzle";
    const s: GameSummary = {
      categoryId,
      gameId: snap.selectedGameId,
      difficulty: snap.difficulty,
      timeMode: snap.timeMode,
      score: snap.score,
      correct: snap.correct,
      total: snap.total,
      secondsPlayed: secondsPlayedNowFromSnap(snap),
      endedBy: reason,
    };

    // update local progress (Step 4)
    const current = lsGet<StoredProgress>(LS_PROGRESS_KEY) ?? {};
    const prev = current[s.gameId] ?? { bestScore: 0, last10: [] };
    const entry: ScoreEntry = {
      ts: Date.now(),
      score: s.score,
      correct: s.correct,
      total: s.total,
      secondsPlayed: s.secondsPlayed,
    };
    const updatedForGame = {
      bestScore: Math.max(prev.bestScore ?? 0, s.score),
      last10: [entry, ...(prev.last10 ?? [])].slice(0, 10),
    };
    const nextProgress: StoredProgress = { ...current, [s.gameId]: updatedForGame };
    lsSet(LS_PROGRESS_KEY, nextProgress);
    setProgress(nextProgress);

    // clear session (Step 4)
    lsRemove(LS_SESSION_KEY);
    setResumeSession(null);

    setRunning(false);
    setSummary(s);
    setView("results");
  }

  // Timer (single interval; avoids constantly creating/clearing intervals)
  useEffect(() => {
    if (!running) {
      if (timerIdRef.current !== null) {
        window.clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
      return;
    }

    if (timerIdRef.current !== null) return;

    timerIdRef.current = window.setInterval(() => {
      const snap = latestRef.current;

      if (snap.timeMode === "endless") {
        setElapsedSeconds((s) => s + 1);
        return;
      }

      setSecondsLeft((s) => {
        if (s <= 1) {
          // Ensure ref reflects the 0 state before ending the game
          latestRef.current.secondsLeft = 0;

          if (timerIdRef.current !== null) {
            window.clearInterval(timerIdRef.current);
            timerIdRef.current = null;
          }

          // End after state update is queued
          queueMicrotask(() => endGame("timer"));
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (timerIdRef.current !== null) {
        window.clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [running]);

  function goToCategories() {
    setView("categories");
  }

  function startGame() {
    const categoryId = selectedCategoryId ?? "puzzle";

    setScore(0);
    setCorrect(0);
    setTotal(0);
    setElapsedSeconds(0);
    setSummary(null);

    if (timeMode === "endless") {
      setSecondsLeft(0);
    } else {
      setSecondsLeft(timeMode);
    }

    setGameState(makeInitialGameState(categoryId, selectedGameId, difficulty));
    setRunning(true);
    setView("game");

    // ensure there is a game selected for the category
    const first = gameOptions.find((g) => g.categoryId === categoryId);
    if (first && !gameOptions.some((g) => g.categoryId === categoryId && g.id === selectedGameId)) {
      setSelectedGameId(first.id);
    }
  }

  function resume() {
    if (!resumeSession) return;

    setSelectedCategoryId(resumeSession.categoryId);
    setSelectedGameId(resumeSession.gameId);
    setDifficulty(resumeSession.difficulty);
    setTimeMode(resumeSession.timeMode);

    setScore(resumeSession.score);
    setCorrect(resumeSession.correct);
    setTotal(resumeSession.total);
    setSecondsLeft(resumeSession.secondsLeft);
    setElapsedSeconds(resumeSession.elapsedSeconds);
    setGameState(resumeSession.gameState);

    setRunning(true);
    setView("game");
  }

  function discardResume() {
    lsRemove(LS_SESSION_KEY);
    setResumeSession(null);
  }

  function secondsPlayedNow() {
    if (timeMode === "endless") return elapsedSeconds;
    return clamp(timeMode - secondsLeft, 0, timeMode);
  }

  const timeLabel =
    timeMode === "endless"
      ? formatTime(elapsedSeconds)
      : running
        ? formatTime(secondsLeft)
        : formatTime(typeof timeMode === "number" ? timeMode : 0);

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      {/* Background accents */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-sky-500/20 via-violet-500/10 to-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-6rem] h-72 w-72 rounded-full bg-gradient-to-tr from-fuchsia-500/15 to-cyan-400/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[40%] h-72 w-72 rounded-full bg-gradient-to-tr from-orange-400/10 to-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_0%,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <button
          type="button"
          onClick={() => setView("home")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3 py-2",
            "border border-white/10 bg-white/5 backdrop-blur",
            "hover:bg-white/8"
          )}
          aria-label="Go to home"
        >
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/90" />
          <span className="text-sm font-semibold tracking-wide">Mind Arcade</span>
        </button>

        <nav className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProgressOpen(true)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-semibold",
              "border border-white/10 bg-white/5 backdrop-blur",
              "hover:bg-white/8"
            )}
          >
            My Progress
          </button>

          <button
            type="button"
            onClick={goToCategories}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-semibold",
              "border border-white/10 bg-white/5 backdrop-blur",
              "hover:bg-white/8"
            )}
          >
            Games
          </button>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-6 pb-16">
        {resumeSession && view !== "game" && view !== "results" ? (
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  Resume your last game?
                </div>
                <div className="mt-1 text-sm text-white/70">
                  {gameTitle(resumeSession.categoryId, resumeSession.gameId)} •{" "}
                  <span className="capitalize">{resumeSession.difficulty}</span> •{" "}
                  {resumeSession.timeMode === "endless"
                    ? "Endless"
                    : `${formatTime(resumeSession.timeMode)} timer`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resume}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={discardResume}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/8"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view === "home" ? (
          <section className="pt-6">
            <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <Pill className="bg-white/6">No login • No ads • Instant games</Pill>

                <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  Play. Think. Improve.
                </h1>

                <p className="mt-4 max-w-xl text-pretty text-base text-white/70 sm:text-lg">
                  Quick, beautiful mini-games that train focus, speed and logic.
                  Pick a category and start immediately—no sign-up needed.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={goToCategories}
                    className={cn(
                      "rounded-2xl px-5 py-3 text-sm font-semibold",
                      "bg-white text-black hover:bg-white/90",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    )}
                  >
                    Choose a Game
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId("puzzle");
                      setSelectedGameId("number_match");
                      setTimeMode(30);
                      setDifficulty("easy");
                      setView("setup");
                    }}
                    className={cn(
                      "rounded-2xl px-5 py-3 text-sm font-semibold",
                      "border border-white/15 bg-white/5 text-white",
                      "hover:bg-white/8",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    )}
                  >
                    Quick Play (30 sec)
                  </button>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {[
                    { k: "Fast", v: "Starts in seconds" },
                    { k: "Clean", v: "Distraction-free UI" },
                    { k: "Local", v: "Progress on this device" },
                  ].map((item) => (
                    <div
                      key={item.k}
                      className={cn(
                        "rounded-2xl border border-white/10 bg-white/5 p-4",
                        "backdrop-blur"
                      )}
                    >
                      <div className="text-sm font-semibold">{item.k}</div>
                      <div className="mt-1 text-sm text-white/70">{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={cn(
                  "relative overflow-hidden rounded-3xl border border-white/10",
                  "bg-white/5 p-5 backdrop-blur"
                )}
              >
                <div className="absolute inset-0 bg-[radial-gradient(22rem_18rem_at_30%_20%,rgba(56,189,248,0.16),transparent_55%),radial-gradient(22rem_18rem_at_70%_80%,rgba(168,85,247,0.12),transparent_55%)]" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white/90">
                        Play in 5 seconds
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        Pick a category → set time + difficulty → start.
                      </div>
                    </div>
                    <Pill className="bg-white/8">Offline-friendly</Pill>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {categories.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "rounded-2xl border border-white/10 bg-white/5 p-4",
                          "transition hover:border-white/20 hover:bg-white/8"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                            {c.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-semibold">
                                {c.name}
                              </div>
                              {c.badge ? (
                                <Pill className="bg-white/8">{c.badge}</Pill>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-white/60">
                              {c.examples.join(" • ")}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 text-xs text-white/55">
                    Step 4: Local storage for progress tracking and game state persistence.
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {view === "categories" ? (
          <section className="pt-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Choose a category
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">
                  Pick what you want to train today. Then choose time + difficulty.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setView("home")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold",
                  "border border-white/15 bg-white/5 hover:bg-white/8"
                )}
              >
                ← Back
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  selected={selectedCategoryId === cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                />
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    Selected:{" "}
                    <span className="text-white/80">
                      {selectedCategory?.name ?? "None"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/65">
                    Continue to select time, difficulty, and a game.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!selectedCategoryId}
                  onClick={() => setView("setup")}
                  className={cn(
                    "rounded-2xl px-5 py-3 text-sm font-semibold",
                    selectedCategoryId
                      ? "bg-white text-black hover:bg-white/90"
                      : "cursor-not-allowed bg-white/20 text-white/60"
                  )}
                  aria-disabled={!selectedCategoryId}
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {view === "setup" ? (
          <section className="pt-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Game setup
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">
                  Choose time mode and difficulty. Then pick a game and start instantly.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setView("categories")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold",
                  "border border-white/15 bg-white/5 hover:bg-white/8"
                )}
              >
                ← Back to categories
              </button>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white/90">Category</div>
                    <div className="mt-1 text-base font-semibold">
                      {selectedCategory?.name ?? "Choose one from categories"}
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      No login • No ads • Instant play
                    </div>
                  </div>

                  <Pill className="bg-white/8">Step 4</Pill>
                </div>

                <div className="mt-6 grid gap-6">
                  <Segmented<TimeMode>
                    label="⏱ Time mode"
                    value={timeMode}
                    options={[
                      { value: 30, label: "30 sec", sub: "Quick" },
                      { value: 60, label: "1 min" },
                      { value: 180, label: "3 min" },
                      { value: "endless", label: "Endless", sub: "No timer" },
                    ]}
                    onChange={(v) => setTimeMode(v)}
                  />

                  <Segmented<Difficulty>
                    label="🎯 Difficulty"
                    value={difficulty}
                    options={[
                      { value: "easy", label: "Easy", sub: "Warm up" },
                      { value: "medium", label: "Medium", sub: "Focused" },
                      { value: "hard", label: "Hard", sub: "Challenge" },
                      { value: "easy", label: "Default", sub: "New users" },
                    ]}
                    onChange={(v) => setDifficulty(v)}
                  />

                  <div>
                    <div className="text-sm font-semibold text-white/90">
                      🎮 Game
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {visibleGames.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedGameId(g.id)}
                          className={cn(
                            "rounded-2xl border p-4 text-left transition",
                            selectedGameId === g.id
                              ? "border-white/25 bg-white/10"
                              : "border-white/10 bg-white/5 hover:bg-white/8"
                          )}
                        >
                          <div className="text-sm font-semibold">{g.label}</div>
                          <div className="mt-1 text-xs text-white/60">{g.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-sm font-semibold text-white/90">Ready?</div>
                <div className="mt-2 text-sm text-white/65">Settings preview</div>

                <div className="mt-4 grid gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Category</div>
                    <div className="mt-1 text-base font-semibold">
                      {selectedCategory?.name ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Time</div>
                    <div className="mt-1 text-base font-semibold">
                      {timeMode === "endless" ? "Endless" : formatTime(timeMode)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Difficulty</div>
                    <div className="mt-1 text-base font-semibold capitalize">
                      {difficulty}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Game</div>
                    <div className="mt-1 text-base font-semibold">
                      {gameTitle(selectedCategoryId ?? "puzzle", selectedGameId)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!selectedCategoryId}
                  onClick={startGame}
                  className={cn(
                    "mt-5 w-full rounded-2xl px-5 py-3 text-sm font-semibold",
                    selectedCategoryId
                      ? "bg-white text-black hover:bg-white/90"
                      : "cursor-not-allowed bg-white/20 text-white/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  )}
                >
                  ▶ Start
                </button>

                <div className="mt-3 text-xs text-white/55">
                  Tip: Brain games feel great in 30–60 seconds.
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {view === "game" ? (
          <GameShell
            title={gameTitle(selectedCategoryId ?? "puzzle", selectedGameId)}
            difficulty={difficulty}
            timeMode={timeMode}
            running={running}
            timeLabel={timeLabel}
            score={score}
            correct={correct}
            total={total}
            onQuit={() => endGame("quit")}
            onFinish={timeMode === "endless" ? () => endGame("finish") : undefined}
          >
            {(selectedCategoryId ?? "puzzle") === "puzzle" ? (
              selectedGameId === "equation_builder" ? (
                gameState?.kind === "equation_builder" ? (
                  <PuzzleEquationBuilder
                    difficulty={difficulty}
                    running={running}
                    state={gameState}
                    setState={(next) => setGameState(next)}
                    onScore={(d) => setScore((s) => s + d)}
                    onAttempt={(ok) => {
                      setTotal((t) => t + 1);
                      if (ok) setCorrect((c) => c + 1);
                    }}
                  />
                ) : null
              ) : gameState?.kind === "number_match" ? (
                <PuzzleNumberMatch
                  difficulty={difficulty}
                  running={running}
                  state={gameState}
                  setState={(next) => setGameState(next)}
                  onScore={(d) => setScore((s) => s + d)}
                  onAttempt={(ok) => {
                    setTotal((t) => t + 1);
                    if (ok) setCorrect((c) => c + 1);
                  }}
                />
              ) : null
            ) : (selectedCategoryId ?? "puzzle") === "brain" ? (
              gameState?.kind === "pattern_finder" ? (
                <BrainPatternFinder
                  difficulty={difficulty}
                  running={running}
                  state={gameState}
                  setState={(next) => setGameState(next)}
                  onScore={(d) => setScore((s) => s + d)}
                  onAttempt={(ok) => {
                    setTotal((t) => t + 1);
                    if (ok) setCorrect((c) => c + 1);
                  }}
                />
              ) : null
            ) : gameState?.kind === "box_merge" ? (
              <BoxMerge
                difficulty={difficulty}
                running={running}
                state={gameState}
                setState={(next) => setGameState(next)}
                onScore={(d) => setScore((s) => s + d)}
                onAttempt={(mergeHappened) => {
                  setTotal((t) => t + 1);
                  if (mergeHappened) setCorrect((c) => c + 1);
                }}
                onGameOver={() => endGame("full")}
              />
            ) : null}
          </GameShell>
        ) : null}

        {view === "results" && summary ? (
          <section className="pt-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Results
                </h2>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {gameTitle(summary.categoryId, summary.gameId)} •{" "}
                  <span className="capitalize">{summary.difficulty}</span> •{" "}
                  {summary.timeMode === "endless"
                    ? "Endless"
                    : `${formatTime(summary.timeMode)} timer`}
                </p>
              </div>

              <Pill className="bg-white/8">
                {summary.endedBy === "timer"
                  ? "Timer ended"
                  : summary.endedBy === "full"
                    ? "Board full"
                    : summary.endedBy === "finish"
                      ? "Finished"
                      : "Quit"}
              </Pill>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="text-xs text-white/60">Score</div>
                <div className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">
                  {summary.score}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Time played</div>
                    <div className="mt-1 text-base font-semibold tabular-nums">
                      {formatTime(summary.secondsPlayed)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Accuracy</div>
                    <div className="mt-1 text-base font-semibold tabular-nums">
                      {summary.total > 0
                        ? `${percent(summary.correct, summary.total)}%`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60">Correct</div>
                    <div className="mt-1 text-base font-semibold tabular-nums">
                      {summary.correct}/{summary.total}
                    </div>
                  </div>
                </div>

                <div className="mt-6 text-sm text-white/70">
                  {summary.categoryId === "box"
                    ? "Tip: try to place tiles next to matching levels to merge more often."
                    : summary.categoryId === "brain"
                      ? "Tip: soften your focus and scan the grid quickly."
                      : "Tip: aim for fewer mistakes—accuracy boosts consistency."}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="text-sm font-semibold text-white/90">Next</div>
                <div className="mt-2 text-sm text-white/65">
                  Play again or tweak settings.
                </div>

                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // keep same setup, start again
                      setView("game");
                      setScore(0);
                      setCorrect(0);
                      setTotal(0);
                      setElapsedSeconds(0);
                      setSummary(null);
                      if (timeMode === "endless") setSecondsLeft(0);
                      else setSecondsLeft(timeMode);
                      setGameState(makeInitialGameState(selectedCategoryId ?? "puzzle", selectedGameId, difficulty));
                      setRunning(true);
                    }}
                    className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
                  >
                    🔁 Play again
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("setup")}
                    className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold hover:bg-white/8"
                  >
                    Adjust setup
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("categories")}
                    className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold hover:bg-white/8"
                  >
                    Back to games
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {/* Progress modal */}
      {progressOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0A0F1D]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-base font-semibold">My Progress (This Device)</div>
                <div className="mt-1 text-sm text-white/65">
                  Stored locally in your browser (no login).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProgressOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/8"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {(["number_match", "equation_builder", "pattern_finder", "box_merge"] as const).map(
                  (gid) => {
                    const p = progress[gid];
                    const best = p?.bestScore ?? 0;
                    const last = p?.last10 ?? [];
                    return (
                      <div
                        key={gid}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">
                            {gameTitle(
                              gid === "pattern_finder"
                                ? "brain"
                                : gid === "box_merge"
                                  ? "box"
                                  : "puzzle",
                              gid
                            )}
                          </div>
                          <Pill className="bg-white/8">Best {best}</Pill>
                        </div>

                        <div className="mt-3">
                          <div className="text-xs text-white/60">Last plays</div>
                          <div className="mt-2 space-y-2">
                            {last.length ? (
                              last.slice(0, 5).map((e) => (
                                <div
                                  key={e.ts}
                                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70"
                                >
                                  <span className="tabular-nums">
                                    Score {e.score} • {formatTime(e.secondsPlayed)}
                                  </span>
                                  <span className="tabular-nums">
                                    {e.total > 0 ? `${Math.round((e.correct / e.total) * 100)}%` : "—"}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-white/50">No plays yet.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    lsRemove(LS_PROGRESS_KEY);
                    setProgress({});
                  }}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/8"
                >
                  Reset progress
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom';
import 'd3-transition';
import { countryName, flagEmoji } from '../lib/countries';
import { colorFor, statusText } from '../lib/status';
import { useApp } from '../store';
import { geometry, invertProjection as invert } from './atlas';
const { width: W, height: H } = geometry;

const MAX_ZOOM = 60;
/** A pointer that moved less than this many px between down and up is a tap, otherwise a pan (spec 5). */
const TAP_SLOP = 8;
const MARKER_PX = 6;
const HIT_PX = 22; // 44px diameter tap target once zoomed in
const HIT_MIN_PX = 8; // markers have no shape of their own, so they need a real target even at world view
const HIT_MIN_SHAPE_PX = 3; // small shapes are already tappable; the circle only extends them

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const canHover = () => window.matchMedia?.('(hover: hover)').matches ?? false;
const markerIds = new Set(geometry.markers.map((m) => m.iso3));
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface Insets {
  right: number;
  bottom: number;
}

export function MapView({ insets }: { insets: Insets }) {
  const entries = useApp((s) => s.entries);
  const paintDelay = useApp((s) => s.paintDelay);
  const selected = useApp((s) => s.selectedCountry);
  const focusRequest = useApp((s) => s.focusRequest);
  const selectCountry = useApp((s) => s.selectCountry);
  const setViewportCenter = useApp((s) => s.setViewportCenter);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipPos = useRef('translate(0px, 0px)');
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const pxScale = useRef(1); // viewBox unit -> CSS px, at zoom 1
  const interacting = useRef(false);
  const setInteracting = (on: boolean) => {
    interacting.current = on;
    // No staggered repaint while panning/zooming (spec 4.7); the CSS rule zeroes the delay.
    svgRef.current?.classList.toggle('interacting', on);
  };
  const insetsRef = useRef(insets);
  useLayoutEffect(() => {
    insetsRef.current = insets;
  });
  const handledNonce = useRef(-1);
  const [hover, setHover] = useState<string | null>(null);

  /** Keeps marker/hit-circle radii constant in screen px while the group is scaled. */
  const applyScale = useCallback((k: number) => {
    const g = gRef.current;
    if (!g) return;
    g.querySelectorAll<SVGCircleElement>('[data-px]').forEach((el) => {
      const px = Number(el.dataset.px);
      // Tap targets grow with zoom: at world view they must not swallow taps meant for big neighbours.
      const screenPx = el.classList.contains('hit')
        ? Math.min(px, Number(el.dataset.min ?? HIT_MIN_PX) + (k - 1) * 4)
        : px;
      el.setAttribute('r', String(screenPx / (pxScale.current * k)));
    });
  }, []);

  // d3-zoom: pinch, pan, wheel, double-tap. The transform is applied to <g>, paths are never recomputed.
  useEffect(() => {
    const svg = svgRef.current!;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .extent([
        [0, 0],
        [W, H],
      ])
      .translateExtent([
        [-W * 0.5, -H * 0.5],
        [W * 1.5, H * 1.5],
      ])
      .clickDistance(TAP_SLOP)
      .on('start', () => setInteracting(true))
      .on('zoom', (e) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        applyScale(e.transform.k);
      })
      .on('end', (e) => {
        setInteracting(false);
        const { x, y, k } = e.transform;
        const center = invert((W / 2 - x) / k, (H / 2 - y) / k);
        if (center) setViewportCenter(center);
      });
    zoomRef.current = behavior;
    select(svg).call(behavior);
    // Replace d3's default double-click handler with a gentler x2 zoom; touch double-taps route through it too.
    select(svg).on('dblclick.zoom', (event: MouseEvent) => {
      event.preventDefault();
      select(svg)
        .transition()
        .duration(prefersReducedMotion() ? 0 : 250)
        .call(behavior.scaleBy, 2);
    });
    return () => {
      select(svg).on('.zoom', null);
    };
  }, [applyScale, setViewportCenter]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current!;
    const measure = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width === 0 || height === 0) return; // hidden tab
      pxScale.current = Math.min(width / W, height / H);
      applyScale(zoomTransform(svgRef.current!).k);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [applyScale]);

  // Centre the picked country in the part of the map that the details panel does not cover (spec 5).
  useEffect(() => {
    if (!focusRequest || focusRequest.iso3 !== selected) return;
    const target = geometry.focus.get(focusRequest.iso3);
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!target || !wrap || !svg || !behavior) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0) return;

    // A new request may zoom; a mere panel resize only re-centres.
    const zoomIn = focusRequest.nonce !== handledNonce.current && focusRequest.zoom;
    handledNonce.current = focusRequest.nonce;

    const s = Math.min(rect.width / W, rect.height / H);
    const offX = (rect.width - W * s) / 2;
    const offY = (rect.height - H * s) / 2;
    const visW = Math.max(rect.width - insetsRef.current.right, 100);
    const visH = Math.max(rect.height - insetsRef.current.bottom, 100);
    const cx = (visW / 2 - offX) / s;
    const cy = (visH / 2 - offY) / s;

    const [[x0, y0], [x1, y1]] = target.bounds;
    const bx = (x0 + x1) / 2;
    const by = (y0 + y1) / 2;
    let k = zoomTransform(svg).k;
    if (zoomIn) {
      const fit = 0.6 * Math.min(visW / s / Math.max(x1 - x0, 1), visH / s / Math.max(y1 - y0, 1));
      k = clamp(fit, 1, 10);
    }
    const transform = zoomIdentity.translate(cx - k * bx, cy - k * by).scale(k);
    select(svg)
      .transition()
      .duration(prefersReducedMotion() ? 0 : 500)
      .call(behavior.transform, transform);
  }, [focusRequest, selected, insets.bottom, insets.right]);

  // Tap vs drag: pointer bookkeeping on our own, independent of d3-zoom's click suppression.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ multi: false, moved: false });

  const isoAt = (target: EventTarget | null) =>
    (target as Element | null)?.closest?.('[data-iso]')?.getAttribute('data-iso') ?? null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (pointers.current.size === 0) gesture.current = { multi: false, moved: false };
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) gesture.current.multi = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = pointers.current.get(e.pointerId);
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) gesture.current.moved = true;
    if (e.pointerType === 'mouse' && canHover() && !interacting.current) {
      const iso = isoAt(e.target);
      setHover((prev) => (prev === iso ? prev : iso));
      const tip = tooltipRef.current;
      const wrap = wrapRef.current;
      if (tip && wrap) {
        const r = wrap.getBoundingClientRect();
        tooltipPos.current = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        tip.style.transform = tooltipPos.current;
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!start) return;
    const { multi, moved } = gesture.current;
    if (multi || moved || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
    selectCountry(isoAt(e.target), 'map');
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current.moved = true;
  };

  const step = (factor: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    select(svg)
      .transition()
      .duration(prefersReducedMotion() ? 0 : 200)
      .call(behavior.scaleBy, factor);
  };
  const reset = () => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    select(svg)
      .transition()
      .duration(prefersReducedMotion() ? 0 : 400)
      .call(behavior.transform, zoomIdentity);
  };

  const countryPaths = useMemo(
    () =>
      geometry.countries.map((c, i) => {
        const entry = c.iso3 ? entries[c.iso3] : undefined;
        const delay = (c.iso3 ? paintDelay[c.iso3] : 0) ?? 0;
        return (
          <path
            key={c.iso3 ?? `shape-${i}`}
            className="country"
            d={c.d}
            data-iso={c.iso3 ?? undefined}
            style={{ fill: colorFor(entry), transitionDelay: `${delay}ms` }}
          />
        );
      }),
    [entries, paintDelay],
  );

  const selectedShape = selected ? geometry.countries.find((c) => c.iso3 === selected) : undefined;
  const hoverEntry = hover ? entries[hover] : undefined;

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Карта мира с визовыми режимами. Выбрать страну можно также через поиск или вкладку «Список»"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => setHover(null)}
      >
        <g ref={gRef}>
          <path d={geometry.spherePath} className="sphere" />
          {countryPaths}
          {selectedShape && <path d={selectedShape.d} className="selected-outline" />}
          {geometry.markers.map((m) => (
            <circle
              key={m.iso3}
              cx={m.x}
              cy={m.y}
              data-px={MARKER_PX}
              className={m.iso3 === selected ? 'marker selected' : 'marker'}
              style={{ fill: colorFor(entries[m.iso3]) }}
            />
          ))}
          {geometry.hitTargets.map((m) => (
            <circle
              key={`hit-${m.iso3}`}
              cx={m.x}
              cy={m.y}
              data-px={HIT_PX}
              data-min={markerIds.has(m.iso3) ? HIT_MIN_PX : HIT_MIN_SHAPE_PX}
              data-iso={m.iso3}
              className="hit"
            />
          ))}
        </g>
      </svg>

      <div className="map-controls">
        <button type="button" aria-label="Приблизить" onClick={() => step(1.6)}>
          +
        </button>
        <button type="button" aria-label="Отдалить" onClick={() => step(1 / 1.6)}>
          −
        </button>
        <button type="button" aria-label="Сбросить вид" onClick={reset}>
          ⤢
        </button>
      </div>

      {hover && (
        <div
          className="tooltip"
          role="tooltip"
          ref={(el) => {
            tooltipRef.current = el;
            if (el) el.style.transform = tooltipPos.current;
          }}
        >
          {flagEmoji(hover)} {countryName(hover)} — {statusText(hoverEntry)}
          {hoverEntry?.inheritedFrom ? ' *' : ''}
        </div>
      )}
    </div>
  );
}

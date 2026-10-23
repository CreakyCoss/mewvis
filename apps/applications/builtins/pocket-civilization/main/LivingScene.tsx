import { useEffect, useRef, useState } from "react";
import { Brush, HeartHandshake, MessageCircle, PackagePlus, Scissors, ShoppingBag } from "lucide-react";
import { ACTORS, ART } from "./art";
import { RESIDENTS, type IslandEvent, type ResidentId, type World } from "./model";
import { HOME, PLACE_IDS, PLACES, roadStatus, walkingRoute, type Activity, type PlaceId } from "./simulation";

const LABELS: Record<Activity, string> = {
  "admit-bread": "承认偷吃", "deny-bread": "藏起空盘子", "share-feeling": "说说心里话", "bridge-fact": "试试真话", "admit-lost": "承认迷路", "find-way": "认一认路", "help-neighbor": "帮帮邻居", "praise-neighbor": "认真夸奖", "decorate-umbrella": "编鲜花伞", "sell-umbrella": "照顾小店", "restock-umbrella": "补进旧雨伞", "clear-flowers": "收拢路边花",
};
const OFFSETS = { atuan: { x: -70, y: 32 }, xiaoman: { x: 0, y: 0 }, mayor: { x: -10, y: 70 }, gardener: { x: 76, y: 44 } };
function residentPoint(id: ResidentId, place: PlaceId) {
  const point = PLACES[place], offset = HOME[id] === place ? { x: 0, y: 0 } : OFFSETS[id];
  return { x: point.x + offset.x, y: point.y + offset.y };
}

export function ResidentActor({ id, world, event, paused, performanceId, index, onResident, onEvent }: {
  id: ResidentId; world: World; event?: IslandEvent; paused: boolean; performanceId: number | null; index: number;
  onResident(id: ResidentId): void; onEvent(id: string): void;
}) {
  const actor = RESIDENTS[id], person = world.island.residents[id], point = residentPoint(id, person.place);
  const element = useRef<HTMLDivElement>(null), animation = useRef<Animation | null>(null), pauseRef = useRef(paused);
  const [walking, setWalking] = useState(false);
  pauseRef.current = paused;
  useEffect(() => {
    setWalking(false);
    if (performanceId === null || !event?.outcome || !element.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { from, to, via } = event.outcome, start = residentPoint(id, from), destination = residentPoint(id, to);
    const route = via ? [...walkingRoute(from, via), ...walkingRoute(via, to).slice(1)] : walkingRoute(from, to);
    route[0] = start; route[route.length - 1] = destination;
    const keyframes = route.map((place) => ({ transform: `translate(${place.x - destination.x}px, ${place.y - destination.y}px)` }));
    const moving = from !== to || !!via && via !== from;
    const performance = element.current.animate(keyframes, { duration: !moving ? 900 : via ? 4200 : 2800, delay: Math.max(0, index) * 4400, easing: "linear", fill: "backwards" });
    animation.current = performance; setWalking(moving);
    if (pauseRef.current) performance.pause();
    performance.onfinish = () => setWalking(false);
    return () => { performance.cancel(); if (animation.current === performance) animation.current = null; };
  }, [performanceId, event?.id]);
  useEffect(() => {
    const performance = animation.current;
    if (!performance || performance.playState === "finished" || performance.playState === "idle") return;
    if (paused) performance.pause(); else performance.play();
  }, [paused]);
  const ActionIcon = event?.kind === "clear" ? Brush : event?.kind === "decorate" ? Scissors : event?.kind === "trade" ? ShoppingBag : event?.kind === "restock" ? PackagePlus : event?.kind === "help" || event?.kind === "praise" ? HeartHandshake : MessageCircle;
  return <div ref={element} className={`resident-position resident-${id} activity-${event?.kind ?? "idle"} ${walking ? "is-walking" : ""}`} style={{ left: point.x, top: point.y, zIndex: Math.round(point.y) }} data-place={person.place}>
    <button className="resident-body" onClick={() => onResident(id)} aria-label={`看看${actor.name}：${actor.role}`} title={`${actor.name} · ${PLACES[person.place].name}`}><img src={ACTORS[id]} alt={actor.name} draggable={false} /></button>
    {event?.effect === "rain" && <img className="rain-effect" src={ART.rain} alt={`${actor.name}头顶正在下雨`} />}
    {event?.activity && <button className="resident-activity" onClick={() => onEvent(event.id)} aria-label={`查看${actor.name}今天的行动：${LABELS[event.activity]}`}><ActionIcon size={14} /><span>{LABELS[event.activity]}</span></button>}
    {id === "atuan" && event && <button className="resident-speech" onClick={() => onEvent(event.id)} aria-label={`查看这件事：${event.speech}`}>{event.speech}</button>}
  </div>;
}

export function IslandChanges({ world, onInspect }: { world: World; onInspect(): void }) {
  const { island } = world;
  return <>
    {PLACE_IDS.filter((id) => island.flowers[id] > 0).map((id) => {
      const place = PLACES[id], count = island.flowers[id];
      return <button key={id} className="persistent-flowers" onClick={onInspect} style={{ left: place.x - 80, top: place.y - 30, zIndex: Math.round(place.y - 100) }} aria-label={`${place.name}留下了${count}簇花${count >= 4 ? "，小路有些拥挤" : ""}`}>
        {Array.from({ length: Math.min(4, Math.ceil(count / 2)) }, (_, index) => <img key={index} src={ART.flowers} alt="" style={{ left: [15, 80, -20, 120][index], top: [14, 39, 55, 18][index], rotate: `${index % 2 ? 12 : -9}deg` }} />)}
      </button>;
    })}
    <button className="shop-flower-basket" onClick={onInspect} aria-label={`雨伞铺的花篮还有${island.shop.looseFlowers}簇花`}>
      <span className="wooden-crate" />{island.shop.looseFlowers > 0 && <img src={ART.flowers} alt="" />}
    </button>
    {island.shop.flowerUmbrellas > 0 && <button className="shop-flower-garland" onClick={onInspect} aria-label={`店里有${island.shop.flowerUmbrellas}把鲜花伞`}><img src={ART.flowers} alt="紫色雨伞上编了一圈鲜花" /></button>}
    {roadStatus(island) !== "通行顺畅" && <button className="road-note" onClick={onInspect}><Brush size={16} />{roadStatus(island) === "拥挤" ? "给小路留一点空隙" : "路边的花越来越多了"}</button>}
  </>;
}

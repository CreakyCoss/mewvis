import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { clamp, keyBy, shuffle } from "lodash-es";
import { X } from "lucide-react";
import catFurnitureStackImageUrl from "./assets/generated/cat-furniture-stack.png";
import mewvisOfficeImageUrl from "./assets/mewvis-office.svg";
import screenDashboardImageUrl from "./assets/screen-dashboard.png";
import screenDesignImageUrl from "./assets/screen-design.png";
import screenDocumentImageUrl from "./assets/screen-document.png";
import screenGameImageUrl from "./assets/screen-game.png";
import screenMediaImageUrl from "./assets/screen-media.png";
import screenResearchImageUrl from "./assets/screen-research.png";
import screenVideoImageUrl from "./assets/screen-video.png";
import { CatImage, type CatBreed } from "./cat-image";
import { APP_DISPLAY_NAME } from "@/product-config";
import "./mewvis-office.css";

type MewvisOfficeProps = {
  isWorking?: boolean;
};

const BUSY_WORDS = ["超忙", "比划中", "计划中", "有这么多事情"];
const CAT_MOVE_DURATION_MS = 5_600;
const MIN_CAT_MOVE_DELAY_MS = 2 * 60 * 1000;
const MAX_CAT_MOVE_DELAY_MS = 4 * 60 * 1000;
const MIN_SCREEN_CONTENT_DELAY_MS = 45 * 1000;
const MAX_SCREEN_CONTENT_DELAY_MS = 90 * 1000;
const MAX_INITIAL_VISITORS = 2;
const OFFICE_WIDTH = 1280;
const OFFICE_HEIGHT = 980;
const PROFILE_CARD_WIDTH = 540;
const PROFILE_CARD_HEIGHT = 430;
const PROFILE_CARD_MARGIN = 36;
const PROFILE_CARD_OFFSET = 88;
const SCREEN_BLUE = "#36a9f4";
const VISITOR_CAT_SCALE = 0.72;
const OFFICE_TITLE = `${APP_DISPLAY_NAME}办公室`;
const VISITOR_SLOTS = [
  { id: "left", xOffset: -74, yOffset: 8, facing: "right" },
  { id: "right", xOffset: 74, yOffset: 8, facing: "left" },
] as const satisfies Array<{
  id: "left" | "right";
  xOffset: number;
  yOffset: number;
  facing: "left" | "right";
}>;

type WorkstationId = "core" | "app" | "browser" | "file" | "writer" | "review";
type PlayAreaId = "coffee" | "gym" | "nap";
type LocationId = WorkstationId | PlayAreaId;

type ScreenBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  accent: string;
};

type ScreenContentKind = "work" | "video" | "game" | "notes";
type ScreenTextureId = "dashboard" | "design" | "document" | "game" | "media" | "research" | "video";

type ScreenTexture = {
  id: ScreenTextureId;
  kind: ScreenContentKind;
  src: string;
};

type OfficeLocation = {
  id: LocationId;
  label: string;
  x: number;
  y: number;
  scale: number;
  type: "workstation" | "play";
  screen?: ScreenBox;
  actions: string[];
};

type OfficeCat = {
  id: string;
  name: string;
  displayName: string;
  localizedName: string;
  role: string;
  breedName: string;
  breed: CatBreed;
  home: WorkstationId;
  bio: string;
  skills: string[];
};

type RandomCatTemplate = {
  id: string;
  localizedName: string;
  breedName: string;
  breed: CatBreed;
};

type RandomWorkstationProfile = Omit<OfficeCat, "id" | "localizedName" | "breedName" | "breed">;

type CatState = {
  catId: string;
  locationId: LocationId;
  action: string;
  facing: "left" | "right";
  view: "front" | "back" | "side" | "lie";
  isWalking: boolean;
  walkAngle: number;
};

type ProfilePlacement = {
  side: "left" | "right" | "bottom";
  left: number;
  top: number;
  arrowTop: number;
};

type CatRenderPlacement = {
  x: number;
  y: number;
  scale: number;
  facing: CatState["facing"];
  view: CatState["view"];
  isVisitor: boolean;
};

type ProfileAnchor = {
  x: number;
  y: number;
};

const WORKSTATIONS: OfficeLocation[] = [
  {
    id: "core",
    label: `${APP_DISPLAY_NAME} 工位`,
    x: 664,
    y: 329,
    scale: 0.92,
    type: "workstation",
    screen: { left: 613, top: 113, width: 100, height: 56, accent: SCREEN_BLUE },
    actions: ["处理任务", "飞快敲字", "整理上下文"],
  },
  {
    id: "app",
    label: "App 工位",
    x: 1034,
    y: 329,
    scale: 0.92,
    type: "workstation",
    screen: { left: 983, top: 113, width: 100, height: 56, accent: SCREEN_BLUE },
    actions: ["调界面", "看状态", "串到 App 工位"],
  },
  {
    id: "file",
    label: "File 工位",
    x: 664,
    y: 609,
    scale: 0.92,
    type: "workstation",
    screen: { left: 613, top: 393, width: 100, height: 56, accent: SCREEN_BLUE },
    actions: ["翻文件", "整理资料", "串到 File 工位"],
  },
  {
    id: "browser",
    label: "Browser 工位",
    x: 1034,
    y: 609,
    scale: 0.92,
    type: "workstation",
    screen: { left: 983, top: 393, width: 100, height: 56, accent: SCREEN_BLUE },
    actions: ["查资料", "盯网页", "串到 Browser 工位"],
  },
  {
    id: "writer",
    label: "Writer 工位",
    x: 664,
    y: 889,
    scale: 0.9,
    type: "workstation",
    screen: { left: 613, top: 673, width: 100, height: 56, accent: SCREEN_BLUE },
    actions: ["润色文字", "想句子", "串到 Writer 工位"],
  },
  {
    id: "review",
    label: "Review 工位",
    x: 1034,
    y: 889,
    scale: 0.9,
    type: "workstation",
    screen: { left: 983, top: 673, width: 100, height: 56, accent: SCREEN_BLUE },
    actions: ["检查细节", "挑问题", "串到 Review 工位"],
  },
];

const PLAY_AREAS: OfficeLocation[] = [
  {
    id: "coffee",
    label: "咖啡台",
    x: 254,
    y: 166,
    scale: 0.62,
    type: "play",
    actions: ["趴在高台", "偷看杯子", "晒太阳"],
  },
  {
    id: "gym",
    label: "娱乐区",
    x: 252,
    y: 528,
    scale: 0.74,
    type: "play",
    actions: ["躺在猫爬架", "抓抓柱", "追逗猫球"],
  },
  {
    id: "nap",
    label: "休息角",
    x: 254,
    y: 792,
    scale: 0.68,
    type: "play",
    actions: ["窝进猫窝", "守着玩具球", "躺平充电"],
  },
];

const LOCATIONS = [...WORKSTATIONS, ...PLAY_AREAS];
const LOCATION_BY_ID = keyBy(LOCATIONS, "id") as Record<LocationId, OfficeLocation>;
const SCREEN_TEXTURES = [
  { id: "document", kind: "work", src: screenDocumentImageUrl },
  { id: "video", kind: "video", src: screenVideoImageUrl },
  { id: "game", kind: "game", src: screenGameImageUrl },
  { id: "dashboard", kind: "work", src: screenDashboardImageUrl },
  { id: "design", kind: "notes", src: screenDesignImageUrl },
  { id: "research", kind: "notes", src: screenResearchImageUrl },
  { id: "media", kind: "video", src: screenMediaImageUrl },
] satisfies ScreenTexture[];
const SCREEN_TEXTURE_IDS = SCREEN_TEXTURES.map((texture) => texture.id);
const SCREEN_TEXTURE_BY_ID = keyBy(SCREEN_TEXTURES, "id") as Record<ScreenTextureId, ScreenTexture>;

const FIXED_OFFICE_CATS: OfficeCat[] = [
  {
    id: "mewvis",
    name: APP_DISPLAY_NAME,
    displayName: APP_DISPLAY_NAME,
    localizedName: "喵维斯",
    role: "Team Leader",
    breedName: "黄白猫",
    breed: "yellow-white",
    home: "core",
    bio: "团队核心，负责统筹任务、调度上下文，并把工作结果收束成可执行的下一步。",
    skills: ["分派任务", "汇总结果", "整理上下文", "读写文档", "写代码"],
  },
  {
    id: "lihua",
    name: "Lihua Agent",
    displayName: "Lihua",
    localizedName: "狸花猫",
    role: "UI Engineer",
    breedName: "狸花猫",
    breed: "brown-tabby",
    home: "app",
    bio: "盯着应用界面和状态流转，负责让交互更顺手、布局更稳。",
    skills: ["界面优化", "状态检查", "交互梳理", "组件联调"],
  },
  {
    id: "orange",
    name: "Orange Agent",
    displayName: "Orange",
    localizedName: "橘猫",
    role: "Research Scout",
    breedName: "橘猫",
    breed: "orange-tabby",
    home: "browser",
    bio: "负责网页资料、外部信息和可视化检查，把找到的线索带回办公室。",
    skills: ["查资料", "网页检查", "截图验证", "信息比对"],
  },
];

const RANDOM_WORKSTATION_PROFILES: RandomWorkstationProfile[] = [
  {
    name: "File Agent",
    displayName: "File",
    role: "Archivist",
    home: "file",
    bio: "整理工作区文件、素材和上下文目录，确保长期协作不丢线索。",
    skills: ["读取文件", "整理目录", "追踪改动", "归档资料"],
  },
  {
    name: "Writer Agent",
    displayName: "Writer",
    role: "Writing Partner",
    home: "writer",
    bio: "处理文案、章节、设定和表达，把粗糙想法打磨成清楚的文字。",
    skills: ["润色文字", "拆解结构", "设定整理", "生成草稿"],
  },
  {
    name: "Review Agent",
    displayName: "Review",
    role: "Quality Reviewer",
    home: "review",
    bio: "负责挑问题、查遗漏和做最终检查，让交付结果更可靠。",
    skills: ["检查细节", "发现风险", "验证结果", "补充测试"],
  },
];

const RANDOM_CAT_TEMPLATES: RandomCatTemplate[] = [
  {
    id: "ragdoll",
    localizedName: "布偶猫",
    breedName: "布偶猫",
    breed: "ragdoll",
  },
  {
    id: "tuxedo",
    localizedName: "奶牛猫",
    breedName: "奶牛猫",
    breed: "tuxedo",
  },
  {
    id: "calico",
    localizedName: "三花猫",
    breedName: "三花猫",
    breed: "calico",
  },
  {
    id: "silver-tabby",
    localizedName: "银渐层",
    breedName: "银渐层",
    breed: "silver-tabby",
  },
  {
    id: "ragdoll-alt",
    localizedName: "海豹布偶",
    breedName: "布偶猫",
    breed: "ragdoll",
  },
];

const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const shuffleItems = <T,>(items: T[]) => shuffle(items);

const getNextMoveDelay = () =>
  MIN_CAT_MOVE_DELAY_MS + Math.floor(Math.random() * (MAX_CAT_MOVE_DELAY_MS - MIN_CAT_MOVE_DELAY_MS));

const getNextScreenContentDelay = () =>
  MIN_SCREEN_CONTENT_DELAY_MS + Math.floor(Math.random() * (MAX_SCREEN_CONTENT_DELAY_MS - MIN_SCREEN_CONTENT_DELAY_MS));

const getLocationView = (location: OfficeLocation): CatState["view"] =>
  location.type === "workstation" ? "back" : "lie";

const isPlayLocation = (locationId: LocationId) => LOCATION_BY_ID[locationId].type === "play";

const isVisitingWorkstation = (cat: OfficeCat, location: OfficeLocation) =>
  location.type === "workstation" && location.id !== cat.home;

const getCatLocationView = (location: OfficeLocation): CatState["view"] => getLocationView(location);

const getWalkingView = (location: OfficeLocation): CatState["view"] =>
  location.type === "workstation" ? "back" : "side";

const getWalkingAngle = (currentLocation: OfficeLocation, nextLocation: OfficeLocation, facing: CatState["facing"]) => {
  if (nextLocation.type === "workstation") {
    return 0;
  }

  const deltaX = nextLocation.x - currentLocation.x;
  const deltaY = nextLocation.y - currentLocation.y;
  const angle = Math.atan2(deltaY, Math.max(Math.abs(deltaX), 220)) * (180 / Math.PI);
  const visualAngle = facing === "left" ? -angle : angle;

  return clamp(visualAngle, -12, 12);
};

const getLocationAction = (cat: OfficeCat, location: OfficeLocation) => {
  if (location.type === "workstation" && location.id !== cat.home) {
    return `串到${location.label.replace(" 工位", "")}`;
  }

  return randomItem(location.actions);
};

const getProfilePlacement = (anchor: ProfileAnchor): ProfilePlacement => {
  const canPlaceBelow =
    anchor.x < 760 && anchor.y + PROFILE_CARD_OFFSET + PROFILE_CARD_HEIGHT < OFFICE_HEIGHT - PROFILE_CARD_MARGIN;

  if (canPlaceBelow) {
    return {
      side: "bottom",
      left: clamp(
        anchor.x - PROFILE_CARD_WIDTH / 2,
        PROFILE_CARD_MARGIN,
        OFFICE_WIDTH - PROFILE_CARD_WIDTH - PROFILE_CARD_MARGIN,
      ),
      top: anchor.y + PROFILE_CARD_OFFSET,
      arrowTop: 0,
    };
  }

  const side = anchor.x > OFFICE_WIDTH * 0.58 ? "left" : "right";
  const left =
    side === "left"
      ? Math.max(anchor.x - PROFILE_CARD_OFFSET - PROFILE_CARD_WIDTH, PROFILE_CARD_MARGIN)
      : Math.min(anchor.x + PROFILE_CARD_OFFSET, OFFICE_WIDTH - PROFILE_CARD_WIDTH - PROFILE_CARD_MARGIN);
  const top = clamp(
    anchor.y - PROFILE_CARD_HEIGHT * 0.45,
    PROFILE_CARD_MARGIN,
    OFFICE_HEIGHT - PROFILE_CARD_HEIGHT - PROFILE_CARD_MARGIN,
  );

  return {
    side,
    left,
    top,
    arrowTop: clamp(anchor.y - top, 54, PROFILE_CARD_HEIGHT - 54),
  };
};

const createInitialScreenTextures = (): Record<WorkstationId, ScreenTextureId> => {
  const shuffledTextureIds = shuffleItems(SCREEN_TEXTURE_IDS);

  return Object.fromEntries(
    WORKSTATIONS.map((station, index) => [
      station.id,
      shuffledTextureIds[index] ?? SCREEN_TEXTURE_IDS[index % SCREEN_TEXTURE_IDS.length],
    ]),
  ) as Record<WorkstationId, ScreenTextureId>;
};

const getUnusedScreenTextureIds = (current: Record<WorkstationId, ScreenTextureId>, stationId: WorkstationId) => {
  const usedByOtherScreens = new Set<ScreenTextureId>(
    (Object.entries(current) as [WorkstationId, ScreenTextureId][])
      .filter(([currentStationId]) => currentStationId !== stationId)
      .map(([, textureId]) => textureId),
  );

  return SCREEN_TEXTURE_IDS.filter(
    (textureId) => textureId !== current[stationId] && !usedByOtherScreens.has(textureId),
  );
};

const createOfficeCats = (): OfficeCat[] => {
  const shuffledTemplates = shuffleItems(RANDOM_CAT_TEMPLATES);
  const randomCats = RANDOM_WORKSTATION_PROFILES.map((profile, index) => {
    const template = shuffledTemplates[index % shuffledTemplates.length];
    return {
      ...profile,
      id: `${profile.home}-${template.id}`,
      localizedName: template.localizedName,
      breedName: template.breedName,
      breed: template.breed,
    };
  });

  return [...FIXED_OFFICE_CATS, ...randomCats];
};

const createHomeCatState = (cat: OfficeCat, isWorking: boolean): CatState => {
  const location = LOCATION_BY_ID[cat.home];
  return {
    catId: cat.id,
    locationId: cat.home,
    action: cat.id === "mewvis" && isWorking ? "处理中" : getLocationAction(cat, location),
    facing: randomItem(["left", "right"] as const),
    view: getCatLocationView(location),
    isWalking: false,
    walkAngle: 0,
  };
};

const createInitialCatStates = (officeCats: OfficeCat[], isWorking: boolean): CatState[] => {
  const statesByCatId = new Map<string, CatState>(
    officeCats.map((cat) => [cat.id, createHomeCatState(cat, isWorking)]),
  );
  const movableCats = officeCats.filter((cat) => !(cat.id === "mewvis" && isWorking));
  const visitorCountsByStation = new Map<WorkstationId, number>();
  const targetVisitorCount = Math.floor(Math.random() * (MAX_INITIAL_VISITORS + 1));
  let visitorCount = 0;

  for (const cat of shuffleItems(movableCats)) {
    if (visitorCount >= targetVisitorCount) {
      break;
    }

    const availableStations = shuffleItems(WORKSTATIONS).filter((station) => {
      if (station.id === cat.home) {
        return false;
      }

      const stationId = station.id as WorkstationId;
      const host = getWorkstationHost(officeCats, stationId);
      const hostState = host ? statesByCatId.get(host.id) : null;
      const visitorCountAtStation = visitorCountsByStation.get(stationId) ?? 0;

      return hostState?.locationId === stationId && visitorCountAtStation < VISITOR_SLOTS.length;
    });

    const nextLocation = availableStations[0];
    if (!nextLocation) {
      continue;
    }

    const stationId = nextLocation.id as WorkstationId;
    visitorCountsByStation.set(stationId, (visitorCountsByStation.get(stationId) ?? 0) + 1);
    statesByCatId.set(cat.id, {
      catId: cat.id,
      locationId: stationId,
      action: getLocationAction(cat, nextLocation),
      facing: nextLocation.x >= LOCATION_BY_ID[cat.home].x ? "right" : "left",
      view: getCatLocationView(nextLocation),
      isWalking: false,
      walkAngle: 0,
    });
    visitorCount += 1;
  }

  const shouldPlacePlayCat = visitorCount === 0 || Math.random() < 0.58;
  if (shouldPlacePlayCat) {
    const playCat = shuffleItems(movableCats).find((cat) => {
      const state = statesByCatId.get(cat.id);
      return state?.locationId === cat.home;
    });

    if (playCat) {
      const playLocation = randomItem(PLAY_AREAS);
      statesByCatId.set(playCat.id, {
        catId: playCat.id,
        locationId: playLocation.id,
        action: getLocationAction(playCat, playLocation),
        facing: randomItem(["left", "right"] as const),
        view: getCatLocationView(playLocation),
        isWalking: false,
        walkAngle: 0,
      });
    }
  }

  return officeCats.map((cat) => {
    const state = statesByCatId.get(cat.id);
    if (state) {
      return state;
    }

    const location = LOCATION_BY_ID[cat.home];
    return {
      catId: cat.id,
      locationId: cat.home,
      action: getLocationAction(cat, location),
      facing: "right",
      view: getCatLocationView(location),
      isWalking: false,
      walkAngle: 0,
    };
  });
};

const getCatState = (states: CatState[], catId: string) => states.find((state) => state.catId === catId);

const getWorkstationHost = (officeCats: OfficeCat[], stationId: WorkstationId) =>
  officeCats.find((cat) => cat.home === stationId);

const hasSettledHostAtWorkstation = (stationId: WorkstationId, states: CatState[], officeCats: OfficeCat[]) => {
  const host = getWorkstationHost(officeCats, stationId);
  const hostState = host ? getCatState(states, host.id) : null;

  return Boolean(hostState && hostState.locationId === stationId && !hostState.isWalking);
};

const getVisitorStatesAtWorkstation = (
  stationId: WorkstationId,
  states: CatState[],
  officeCats: OfficeCat[],
  excludedCatId?: string,
) =>
  states.filter((state) => {
    if (state.catId === excludedCatId || state.locationId !== stationId) {
      return false;
    }

    const cat = officeCats.find((officeCat) => officeCat.id === state.catId);
    return Boolean(cat && cat.home !== stationId);
  });

const hasVisitorsAtHomeWorkstation = (cat: OfficeCat, states: CatState[], officeCats: OfficeCat[]) =>
  getVisitorStatesAtWorkstation(cat.home, states, officeCats, cat.id).length > 0;

const hasCatInPlayArea = (states: CatState[], excludedCatId?: string) =>
  states.some((state) => state.catId !== excludedCatId && isPlayLocation(state.locationId));

const canVisitWorkstation = (cat: OfficeCat, stationId: WorkstationId, states: CatState[], officeCats: OfficeCat[]) => {
  if (cat.home === stationId) {
    return true;
  }

  return (
    hasSettledHostAtWorkstation(stationId, states, officeCats) &&
    getVisitorStatesAtWorkstation(stationId, states, officeCats, cat.id).length < VISITOR_SLOTS.length
  );
};

const getCatRenderPlacement = (
  cat: OfficeCat,
  state: CatState,
  states: CatState[],
  officeCats: OfficeCat[],
): CatRenderPlacement => {
  const location = LOCATION_BY_ID[state.locationId];
  const isVisitor = isVisitingWorkstation(cat, location);
  if (!isVisitor) {
    return {
      x: location.x,
      y: location.y,
      scale: location.scale,
      facing: state.facing,
      view: state.view,
      isVisitor: false,
    };
  }

  const visitorsAtLocation = states
    .filter((candidateState) => {
      const candidateCat = officeCats.find((officeCat) => officeCat.id === candidateState.catId);
      return (
        candidateCat && candidateState.locationId === state.locationId && isVisitingWorkstation(candidateCat, location)
      );
    })
    .map((candidateState) => candidateState.catId);
  const visitorIndex = Math.max(visitorsAtLocation.indexOf(cat.id), 0);
  const visitorSlot = VISITOR_SLOTS[Math.min(visitorIndex, VISITOR_SLOTS.length - 1)];

  return {
    x: location.x + visitorSlot.xOffset,
    y: location.y + visitorSlot.yOffset,
    scale: Math.max(location.scale * VISITOR_CAT_SCALE, 0.58),
    facing: visitorSlot.facing,
    view: "back",
    isVisitor: true,
  };
};

const pickNextLocation = (
  cat: OfficeCat,
  currentLocationId: LocationId,
  states: CatState[],
  officeCats: OfficeCat[],
  isWorking: boolean,
) => {
  if (cat.id === "mewvis" && isWorking) {
    return LOCATION_BY_ID.core;
  }

  const currentLocation = LOCATION_BY_ID[currentLocationId];
  const workstationPool = WORKSTATIONS.filter(
    (location) =>
      location.id !== currentLocation.id && canVisitWorkstation(cat, location.id as WorkstationId, states, officeCats),
  );
  const playPool = hasCatInPlayArea(states, cat.id)
    ? []
    : PLAY_AREAS.filter((location) => location.id !== currentLocation.id);
  const weightedPool = [...workstationPool, ...workstationPool, ...playPool, ...playPool, ...playPool];

  return weightedPool.length > 0 ? randomItem(weightedPool) : currentLocation;
};

export const MewvisOffice = ({ isWorking = false }: MewvisOfficeProps) => {
  const boardRef = useRef<HTMLElement | null>(null);
  const isWorkingRef = useRef(isWorking);
  const settleTimeoutsRef = useRef<number[]>([]);
  const [officeCats] = useState<OfficeCat[]>(() => createOfficeCats());
  const [catStates, setCatStates] = useState<CatState[]>(() => createInitialCatStates(officeCats, isWorking));
  const [screenTextureIds, setScreenTextureIds] = useState(createInitialScreenTextures);
  const [officeScale, setOfficeScale] = useState(1);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return;
    }

    const updateScale = () => {
      setOfficeScale(Math.max(board.clientWidth / OFFICE_WIDTH, 0.01));
    };

    updateScale();

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(board);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    isWorkingRef.current = isWorking;

    if (!isWorking) {
      return;
    }

    setCatStates((states) =>
      states.map((state) =>
        state.catId === "mewvis"
          ? {
              ...state,
              locationId: "core",
              action: "处理中",
              facing: "right",
              view: "back",
              isWalking: false,
              walkAngle: 0,
            }
          : state,
      ),
    );
  }, [isWorking]);

  useEffect(() => {
    let isCancelled = false;
    let moveTimeoutId: number | null = null;

    const scheduleNextMove = () => {
      moveTimeoutId = window.setTimeout(() => {
        if (isCancelled) {
          return;
        }

        let walkingCatId: string | null = null;
        let settledLocationId: LocationId | null = null;

        setCatStates((states) => {
          const movableCats = officeCats.filter((cat) => {
            if (cat.id === "mewvis" && isWorkingRef.current) {
              return false;
            }

            const state = states.find((catState) => catState.catId === cat.id);
            if (!state || state.isWalking) {
              return false;
            }

            return !(state.locationId === cat.home && hasVisitorsAtHomeWorkstation(cat, states, officeCats));
          });

          if (movableCats.length === 0) {
            return states;
          }

          const movingCat = randomItem(movableCats);

          return states.map((state) => {
            if (state.catId !== movingCat.id) {
              return state;
            }

            const nextLocation = pickNextLocation(
              movingCat,
              state.locationId,
              states,
              officeCats,
              isWorkingRef.current,
            );
            const currentLocation = LOCATION_BY_ID[state.locationId];
            const facing = nextLocation.x >= currentLocation.x ? "right" : "left";
            walkingCatId = movingCat.id;
            settledLocationId = nextLocation.id;

            return {
              catId: movingCat.id,
              locationId: nextLocation.id,
              action: `慢慢走去${nextLocation.label.replace(" 工位", "")}`,
              facing,
              view: getWalkingView(nextLocation),
              isWalking: true,
              walkAngle: getWalkingAngle(currentLocation, nextLocation, facing),
            };
          });
        });

        if (walkingCatId && settledLocationId) {
          const settledCatId = walkingCatId;
          const nextLocation = LOCATION_BY_ID[settledLocationId];
          const settleTimeoutId = window.setTimeout(() => {
            setCatStates((states) =>
              states.map((state) => {
                if (state.catId !== settledCatId) {
                  return state;
                }

                const cat = officeCats.find((officeCat) => officeCat.id === settledCatId);
                return {
                  ...state,
                  action: cat ? getLocationAction(cat, nextLocation) : state.action,
                  view: getCatLocationView(nextLocation),
                  isWalking: false,
                  walkAngle: 0,
                };
              }),
            );
          }, CAT_MOVE_DURATION_MS);
          settleTimeoutsRef.current.push(settleTimeoutId);
        }

        scheduleNextMove();
      }, getNextMoveDelay());
    };

    scheduleNextMove();

    return () => {
      isCancelled = true;
      if (moveTimeoutId !== null) {
        window.clearTimeout(moveTimeoutId);
      }
      settleTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      settleTimeoutsRef.current = [];
    };
  }, [officeCats]);

  useEffect(() => {
    let isCancelled = false;
    let screenTimeoutId: number | null = null;

    const scheduleNextScreenContent = () => {
      screenTimeoutId = window.setTimeout(() => {
        if (isCancelled) {
          return;
        }

        const station = randomItem(WORKSTATIONS);
        const stationId = station.id as WorkstationId;
        setScreenTextureIds((current) => {
          const availableTextureIds = getUnusedScreenTextureIds(current, stationId);
          if (availableTextureIds.length === 0) {
            return current;
          }

          return {
            ...current,
            [stationId]: randomItem(availableTextureIds),
          };
        });
        scheduleNextScreenContent();
      }, getNextScreenContentDelay());
    };

    scheduleNextScreenContent();

    return () => {
      isCancelled = true;
      if (screenTimeoutId !== null) {
        window.clearTimeout(screenTimeoutId);
      }
    };
  }, []);

  const occupiedWorkstations = useMemo(() => {
    const ids = new Set<LocationId>();
    catStates.forEach((state) => {
      const location = LOCATION_BY_ID[state.locationId];
      if (location.type === "workstation") {
        ids.add(location.id);
      }
    });
    return ids;
  }, [catStates]);

  const selectedCat = selectedCatId ? (officeCats.find((cat) => cat.id === selectedCatId) ?? null) : null;
  const selectedCatState = selectedCat ? (catStates.find((state) => state.catId === selectedCat.id) ?? null) : null;
  const selectedCatLocation = selectedCatState ? LOCATION_BY_ID[selectedCatState.locationId] : null;
  const selectedCatRenderPlacement =
    selectedCat && selectedCatState
      ? getCatRenderPlacement(selectedCat, selectedCatState, catStates, officeCats)
      : null;
  const selectedCatStatus = selectedCatState?.isWalking
    ? "移动中"
    : selectedCat?.id === "mewvis" && isWorking
      ? "忙碌中"
      : selectedCatLocation?.type === "workstation"
        ? selectedCat && selectedCatLocation.id !== selectedCat.home
          ? "串门中"
          : "工作中"
        : "休息中";
  const selectedCatProfilePlacement = selectedCatRenderPlacement
    ? getProfilePlacement(selectedCatRenderPlacement)
    : null;

  return (
    <div className="mewvis-office-shell">
      <div className="mewvis-office-heading">
        <h2 className="mewvis-office-title">{OFFICE_TITLE}</h2>
      </div>

      <section
        ref={boardRef}
        className="mewvis-office-board"
        style={{ "--office-scale": officeScale } as CSSProperties}
        aria-label={OFFICE_TITLE}
      >
        <div className="mewvis-office-stage">
          <img className="mewvis-office-image" src={mewvisOfficeImageUrl} alt="" aria-hidden="true" />

          <img
            className="mewvis-office-cat-furniture-image is-back"
            src={catFurnitureStackImageUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
          />

          {WORKSTATIONS.map((station) =>
            (() => {
              const stationId = station.id as WorkstationId;
              const screenTexture = SCREEN_TEXTURE_BY_ID[screenTextureIds[stationId]];
              return (
                <div
                  key={station.id}
                  className={[
                    "mewvis-office-screen",
                    occupiedWorkstations.has(station.id) ? "is-lit" : "",
                    screenTexture ? "has-screen-texture" : "",
                    `is-screen-${screenTexture.kind}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    {
                      "--screen-accent": station.screen?.accent,
                      "--screen-texture": `url(${screenTexture.src})`,
                      "--screen-left": `${station.screen?.left ?? 0}px`,
                      "--screen-top": `${station.screen?.top ?? 0}px`,
                      "--screen-width": `${station.screen?.width ?? 0}px`,
                      "--screen-height": `${station.screen?.height ?? 0}px`,
                    } as CSSProperties
                  }
                >
                  <div className="mewvis-office-screen-content" aria-hidden="true">
                    <span className="screen-slot screen-a" />
                    <span className="screen-slot screen-b" />
                    <span className="screen-slot screen-c" />
                    <span className="screen-slot screen-d" />
                    <span className="screen-slot screen-e" />
                  </div>
                </div>
              );
            })(),
          )}

          {catStates.map((state) => {
            const cat = officeCats.find((officeCat) => officeCat.id === state.catId);
            const location = LOCATION_BY_ID[state.locationId];
            if (!cat) {
              return null;
            }

            const placement = getCatRenderPlacement(cat, state, catStates, officeCats);

            return (
              <button
                type="button"
                key={cat.id}
                className={[
                  "mewvis-office-cat",
                  `is-facing-${placement.facing}`,
                  `is-${location.type}`,
                  `is-location-${location.id}`,
                  placement.isVisitor ? "is-visitor" : "",
                  state.isWalking ? "is-walking" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    "--cat-x": `${placement.x}px`,
                    "--cat-y": `${placement.y}px`,
                    "--cat-scale": placement.scale,
                    "--cat-move-duration": `${CAT_MOVE_DURATION_MS}ms`,
                    "--cat-walk-angle": `${state.walkAngle}deg`,
                  } as CSSProperties
                }
                aria-label={`查看 ${cat.name} 详细信息`}
                onClick={() => setSelectedCatId(cat.id)}
              >
                <div className="mewvis-office-cat-label">{cat.displayName}</div>
                <CatImage breed={cat.breed} view={placement.view} />
                {location.type === "workstation" && !state.isWalking && !placement.isVisitor && (
                  <span className="mewvis-office-chair-front" aria-hidden="true" />
                )}
              </button>
            );
          })}

          <img
            className="mewvis-office-cat-furniture-image is-front"
            src={catFurnitureStackImageUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
          />

          {isWorking && (
            <div className="mewvis-office-busy-words">
              {BUSY_WORDS.map((word) => (
                <span key={word}>{word}</span>
              ))}
            </div>
          )}

          {selectedCat && selectedCatState && selectedCatLocation && selectedCatProfilePlacement && (
            <div
              className="mewvis-office-profile-layer"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedCatId(null);
                }
              }}
            >
              <section
                className={`mewvis-office-profile-card is-${selectedCatProfilePlacement.side}`}
                style={
                  {
                    "--profile-left": `${selectedCatProfilePlacement.left}px`,
                    "--profile-top": `${selectedCatProfilePlacement.top}px`,
                    "--profile-arrow-top": `${selectedCatProfilePlacement.arrowTop}px`,
                  } as CSSProperties
                }
                role="dialog"
                aria-modal="false"
                aria-labelledby="mewvis-office-profile-title"
              >
                <button
                  type="button"
                  className="mewvis-office-profile-close"
                  aria-label="关闭猫猫详情"
                  onClick={() => setSelectedCatId(null)}
                >
                  <X aria-hidden="true" />
                </button>

                <div className="mewvis-office-profile-head">
                  <div className="mewvis-office-profile-avatar">
                    <CatImage breed={selectedCat.breed} view="front" />
                  </div>
                  <div className="mewvis-office-profile-title-group">
                    <h3 id="mewvis-office-profile-title">
                      {selectedCat.name}({selectedCat.localizedName})
                    </h3>
                    <p>{selectedCat.role}</p>
                    <div className="mewvis-office-profile-status">
                      <span aria-hidden="true" />
                      {selectedCatStatus} · {selectedCatLocation.label}
                    </div>
                  </div>
                </div>

                <div className="mewvis-office-profile-section">
                  <div className="mewvis-office-profile-section-label">简介</div>
                  <p>{selectedCat.bio}</p>
                </div>

                <div className="mewvis-office-profile-section">
                  <div className="mewvis-office-profile-section-label">技能</div>
                  <div className="mewvis-office-profile-skills">
                    {selectedCat.skills.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

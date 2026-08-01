import brownTabbyBackUrl from "./assets/cats/brown-tabby-back.png";
import brownTabbyFrontUrl from "./assets/cats/brown-tabby-front.png";
import brownTabbyLieUrl from "./assets/cats/brown-tabby-lie.png";
import brownTabbySideUrl from "./assets/cats/brown-tabby-side.png";
import calicoBackUrl from "./assets/cats/calico-back.png";
import calicoFrontUrl from "./assets/cats/calico-front.png";
import calicoLieUrl from "./assets/cats/calico-lie.png";
import calicoSideUrl from "./assets/cats/calico-side.png";
import chineseDomesticBackUrl from "./assets/cats/chinese-domestic-back.png";
import chineseDomesticFrontUrl from "./assets/cats/chinese-domestic-front.png";
import chineseDomesticLieUrl from "./assets/cats/chinese-domestic-lie.png";
import chineseDomesticSideUrl from "./assets/cats/chinese-domestic-side.png";
import orangeTabbyBackUrl from "./assets/cats/orange-tabby-back.png";
import orangeTabbyFrontUrl from "./assets/cats/orange-tabby-front.png";
import orangeTabbyLieUrl from "./assets/cats/orange-tabby-lie.png";
import orangeTabbySideUrl from "./assets/cats/orange-tabby-side.png";
import ragdollBackUrl from "./assets/cats/ragdoll-back.png";
import ragdollFrontUrl from "./assets/cats/ragdoll-front.png";
import ragdollLieUrl from "./assets/cats/ragdoll-lie.png";
import ragdollSideUrl from "./assets/cats/ragdoll-side.png";
import silverTabbyBackUrl from "./assets/cats/silver-tabby-back.png";
import silverTabbyFrontUrl from "./assets/cats/silver-tabby-front.png";
import silverTabbyLieUrl from "./assets/cats/silver-tabby-lie.png";
import silverTabbySideUrl from "./assets/cats/silver-tabby-side.png";
import tuxedoBackUrl from "./assets/cats/tuxedo-back.png";
import tuxedoFrontUrl from "./assets/cats/tuxedo-front.png";
import tuxedoLieUrl from "./assets/cats/tuxedo-lie.png";
import tuxedoSideUrl from "./assets/cats/tuxedo-side.png";
import yellowWhiteBackUrl from "./assets/cats/yellow-white-back.png";
import yellowWhiteFrontUrl from "./assets/cats/yellow-white-front.png";
import yellowWhiteLieUrl from "./assets/cats/yellow-white-lie.png";
import yellowWhiteSideUrl from "./assets/cats/yellow-white-side.png";

type CatBreed =
  | "chinese-domestic"
  | "yellow-white"
  | "orange-tabby"
  | "brown-tabby"
  | "ragdoll"
  | "calico"
  | "silver-tabby"
  | "tuxedo";

type CatView = "front" | "back" | "side" | "lie";

type CatImageProps = {
  breed: CatBreed;
  view: CatView;
};

const CAT_IMAGE_BY_BREED: Record<CatBreed, Record<CatView, string>> = {
  "chinese-domestic": {
    front: chineseDomesticFrontUrl,
    back: chineseDomesticBackUrl,
    side: chineseDomesticSideUrl,
    lie: chineseDomesticLieUrl,
  },
  "yellow-white": {
    front: yellowWhiteFrontUrl,
    back: yellowWhiteBackUrl,
    side: yellowWhiteSideUrl,
    lie: yellowWhiteLieUrl,
  },
  "orange-tabby": {
    front: orangeTabbyFrontUrl,
    back: orangeTabbyBackUrl,
    side: orangeTabbySideUrl,
    lie: orangeTabbyLieUrl,
  },
  "brown-tabby": {
    front: brownTabbyFrontUrl,
    back: brownTabbyBackUrl,
    side: brownTabbySideUrl,
    lie: brownTabbyLieUrl,
  },
  ragdoll: {
    front: ragdollFrontUrl,
    back: ragdollBackUrl,
    side: ragdollSideUrl,
    lie: ragdollLieUrl,
  },
  calico: {
    front: calicoFrontUrl,
    back: calicoBackUrl,
    side: calicoSideUrl,
    lie: calicoLieUrl,
  },
  "silver-tabby": {
    front: silverTabbyFrontUrl,
    back: silverTabbyBackUrl,
    side: silverTabbySideUrl,
    lie: silverTabbyLieUrl,
  },
  tuxedo: {
    front: tuxedoFrontUrl,
    back: tuxedoBackUrl,
    side: tuxedoSideUrl,
    lie: tuxedoLieUrl,
  },
};

export const CatImage = ({ breed, view }: CatImageProps) => (
  <img
    className="mewvis-cat-image"
    src={CAT_IMAGE_BY_BREED[breed][view]}
    alt=""
    aria-hidden="true"
    draggable={false}
    decoding="async"
  />
);

export type { CatBreed };

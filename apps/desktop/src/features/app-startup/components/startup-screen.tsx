import { APP_DISPLAY_NAME } from "@/product-config";

type StartupScreenProps = {
  isComplete?: boolean;
  statusText: string;
};

const STARTUP_CATS = [
  {
    id: "mewvis",
    sheet: "/assets/startup-cats/spritesheets/mewvis-walk.png",
    label: "Mewvis",
  },
  {
    id: "lihua",
    sheet: "/assets/startup-cats/spritesheets/lihua-walk.png",
    label: "狸花猫",
  },
  {
    id: "orange",
    sheet: "/assets/startup-cats/spritesheets/orange-walk.png",
    label: "橘猫",
  },
];

const StartupLogo = () => (
  <img
    className="startup-screen__logo"
    src="/assets/startup-cat-icon.png"
    alt=""
    aria-hidden="true"
  />
);

export const StartupScreen = ({ isComplete = false, statusText }: StartupScreenProps) => {
  return (
    <main
      className={`startup-screen${isComplete ? " startup-screen--complete" : ""}`}
      aria-busy="true"
      aria-label={`${APP_DISPLAY_NAME} 正在启动`}
    >
      <section className="startup-screen__content">
        <div className="startup-screen__brand">
          <StartupLogo />
          <h1 className="startup-screen__brand-name">{APP_DISPLAY_NAME}</h1>
        </div>
        <div className="startup-screen__cat-progress" aria-hidden="true">
          <div className="startup-screen__cat-lane">
            <span className="startup-screen__lane-fill" />
            <span className="startup-screen__paw-trail" />
            <span className="startup-screen__lane-head" />
            {STARTUP_CATS.map((cat) => (
              <span
                key={cat.id}
                className={`startup-screen__cat-walker startup-screen__cat-walker--${cat.id}`}
              >
                <span className="startup-screen__cat-sprite">
                  <img
                    className="startup-screen__cat-sheet"
                    src={cat.sheet}
                    alt=""
                  />
                </span>
                <span className="startup-screen__cat-name">{cat.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="startup-screen__status">{statusText}</div>
      </section>
    </main>
  );
};

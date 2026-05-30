type StartupScreenProps = {
  statusText: string;
};

const StartupLogo = () => (
  <img
    className="startup-screen__logo"
    src="/assets/startup-cat-icon.png"
    alt=""
    aria-hidden="true"
  />
);

export const StartupScreen = ({ statusText }: StartupScreenProps) => {
  return (
    <main className="startup-screen" aria-busy="true" aria-label="Mewvis 正在启动">
      <section className="startup-screen__content">
        <div className="startup-screen__brand">
          <StartupLogo />
          <h1 className="startup-screen__brand-name">Mewvis</h1>
        </div>
        <div className="startup-screen__progress" aria-hidden="true" />
        <div className="startup-screen__status">{statusText}</div>
      </section>
    </main>
  );
};

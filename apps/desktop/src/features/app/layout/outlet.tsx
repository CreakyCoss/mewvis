import { Outlet } from "react-router";

export const MainOutlet = () => (
  <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background pt-10">
    <Outlet />
  </section>
);

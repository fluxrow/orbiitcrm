import { Outlet } from "react-router-dom";
import HotsiteHeader from "@/components/HotsiteHeader";

export default function PublicLayout() {
  return (
    <>
      <HotsiteHeader />
      <div className="pt-16">
        <Outlet />
      </div>
    </>
  );
}

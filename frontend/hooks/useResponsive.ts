"use client";

import { useEffect, useState } from "react";

export type Breakpoint = "mobile" | "tablet" | "laptop" | "desktop";

const QUERIES: { breakpoint: Breakpoint; query: string }[] = [
  { breakpoint: "mobile", query: "(max-width: 767px)" },
  { breakpoint: "tablet", query: "(min-width: 768px) and (max-width: 1023px)" },
  { breakpoint: "laptop", query: "(min-width: 1024px) and (max-width: 1439px)" },
];

/**
 * Hook UI thuần — chỉ đọc kích thước màn hình hiện tại để quyết định
 * layout (ẩn/hiện Sidebar, Chat dạng Drawer...). KHÔNG chứa business logic
 * nào, không đụng tới state phòng/socket.
 */
export function useResponsive() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    const mediaQueryLists = QUERIES.map(({ query }) => window.matchMedia(query));

    const update = () => {
      const matched = QUERIES.find((_, i) => mediaQueryLists[i].matches);
      setBreakpoint(matched?.breakpoint ?? "desktop");
    };

    update();
    mediaQueryLists.forEach((mql) => mql.addEventListener("change", update));
    return () => mediaQueryLists.forEach((mql) => mql.removeEventListener("change", update));
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    /** Sidebar/Chat nên thu gọn thành Drawer ở mobile + tablet */
    isCompact: breakpoint === "mobile" || breakpoint === "tablet",
  };
}
import { useCallback } from "react";

export function usePreventHorizontalHistorySwipe<T extends HTMLElement>() {
  return useCallback((event: React.WheelEvent<T>) => {
    const element = event.currentTarget;
    const isHorizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!isHorizontalIntent || element.scrollWidth <= element.clientWidth) return;
    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const atStart = element.scrollLeft <= 0;
    const atEnd = element.scrollLeft >= maxScrollLeft - 1;
    const movingLeft = event.deltaX < 0;
    const movingRight = event.deltaX > 0;
    event.stopPropagation();
    if ((atStart && movingLeft) || (atEnd && movingRight)) {
      event.preventDefault();
    }
  }, []);
}

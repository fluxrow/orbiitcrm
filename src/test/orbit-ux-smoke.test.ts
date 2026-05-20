import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildCampaignAudienceFilters } from "@/lib/orbit/campaign-audience";
import { useDebounce } from "@/hooks/useDebounce";

describe("orbit ux smoke", () => {
  it("persists manual prospects and send groups inside campaign filters", () => {
    const filters = buildCampaignAudienceFilters(
      { segmento: "Tecnologia", tags: ["vip"] },
      ["prospect-1", "prospect-2"],
      ["group-1"],
    );

    expect(filters).toEqual({
      segmento: "Tecnologia",
      tags: ["vip"],
      selected_prospect_ids: ["prospect-1", "prospect-2"],
      selected_group_ids: ["group-1"],
    });
  });

  it("debounces fast search updates before releasing the latest value", () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "jo", delay: 300 },
      },
    );

    expect(result.current).toBe("jo");

    rerender({ value: "joao", delay: 300 });
    expect(result.current).toBe("jo");

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("jo");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("joao");

    vi.useRealTimers();
  });
});

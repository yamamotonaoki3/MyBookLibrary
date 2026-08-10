/**
 * jsdom project 専用の setup。コンポーネントテスト全般で必要になる
 * 既定モックをここにまとめる。
 */
import "@testing-library/jest-dom";

// next/navigation の各フックは Provider の外で呼ぶとエラーになるため、
// 個々のテストで上書きできる既定のモックを用意しておく。
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}));

// next/image は最適化・遅延読み込みを行うため、テストでは素の <img> に
// 置き換える。fill・sizes 等の Next 固有 props は DOM に渡さない。
jest.mock("next/image", () => ({
  __esModule: true,
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; sizes?: string }
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fill, sizes, ...imgProps } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imgProps} alt={props.alt ?? ""} />;
  },
}));

// jsdom は matchMedia を実装しないため、参照するコンポーネントのために
// 常に「マッチしない」既定値を返すスタブを用意する。
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

// navigator.setAppBadge / clearAppBadge は未対応ブラウザもあるAPIで、
// jsdom には実装が無い。src/lib/badge.ts は両方を使うため、
// 両方をスタブしないと「setAppBadge だけ通過して clearAppBadge で
// TypeError」という事故になる（#437 の依存関係マップで判明済み）。
if (typeof navigator !== "undefined") {
  Object.defineProperty(navigator, "setAppBadge", {
    value: jest.fn().mockResolvedValue(undefined),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "clearAppBadge", {
    value: jest.fn().mockResolvedValue(undefined),
    configurable: true,
    writable: true,
  });
}

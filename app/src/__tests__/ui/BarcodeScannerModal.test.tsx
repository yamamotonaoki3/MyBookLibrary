import { act, render, screen } from "@testing-library/react";
import BarcodeScannerModal from "@/app/books/search/_components/BarcodeScannerModal";

const startMock = jest.fn();
const stopMock = jest.fn();
const clearMock = jest.fn();
let onDecoded: ((text: string) => void) | undefined;

jest.mock("html5-qrcode", () => ({
  Html5Qrcode: jest.fn().mockImplementation(() => ({
    start: (...args: unknown[]) => {
      startMock(...args);
      onDecoded = args[2] as (text: string) => void;
      return Promise.resolve();
    },
    stop: () => {
      stopMock();
      return Promise.resolve();
    },
    clear: clearMock,
  })),
}));

beforeEach(() => {
  startMock.mockClear();
  stopMock.mockClear();
  clearMock.mockClear();
  onDecoded = undefined;
});

it("親が再レンダリングされてもカメラを再起動しない", async () => {
  const { rerender } = render(<BarcodeScannerModal onClose={() => {}} onScanned={() => {}} />);
  await act(async () => {});
  expect(startMock).toHaveBeenCalledTimes(1);

  // 親が毎回新しい関数を渡す状況（インライン関数）を再現する
  rerender(<BarcodeScannerModal onClose={() => {}} onScanned={() => {}} />);
  rerender(<BarcodeScannerModal onClose={() => {}} onScanned={() => {}} />);
  await act(async () => {});

  expect(startMock).toHaveBeenCalledTimes(1);
  expect(stopMock).not.toHaveBeenCalled();
});

it("再レンダリング後も、最新の onScanned / onClose が呼ばれる", async () => {
  const firstScanned = jest.fn();
  const latestScanned = jest.fn();
  const latestClose = jest.fn();
  const { rerender } = render(<BarcodeScannerModal onClose={() => {}} onScanned={firstScanned} />);
  await act(async () => {});
  rerender(<BarcodeScannerModal onClose={latestClose} onScanned={latestScanned} />);

  act(() => onDecoded?.("9784101010014"));

  expect(latestScanned).toHaveBeenCalledWith("9784101010014");
  expect(firstScanned).not.toHaveBeenCalled();
  expect(latestClose).toHaveBeenCalledTimes(1);
});

it("ISBN として不正な文字列は無視する", async () => {
  const onScanned = jest.fn();
  render(<BarcodeScannerModal onClose={() => {}} onScanned={onScanned} />);
  await act(async () => {});

  act(() => onDecoded?.("12345"));

  expect(onScanned).not.toHaveBeenCalled();
});

it("通常は診断表示を出さない", async () => {
  render(<BarcodeScannerModal onClose={() => {}} onScanned={() => {}} />);
  await act(async () => {});
  expect(screen.queryByTestId("scan-debug")).not.toBeInTheDocument();
});

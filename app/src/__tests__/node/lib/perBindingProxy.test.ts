import { createPerBindingProxy } from "@/lib/perBindingProxy";

type FakeClient = {
  id: number;
  user: { findMany: () => string };
  $disconnect: () => string;
  self: () => FakeClient;
};

function setup() {
  let bindingNumber = 0;
  let binding: object = { n: ++bindingNumber };
  let created = 0;
  const createClient = jest.fn((b: object): FakeClient => {
    const id = ++created;
    const client: FakeClient = {
      id,
      user: { findMany: () => `users@${(b as { n: number }).n}` },
      $disconnect: () => `disconnected:${id}`,
      self() {
        return this;
      },
    };
    return client;
  });
  const proxy = createPerBindingProxy(() => binding, createClient);
  return {
    proxy,
    createClient,
    switchBinding: () => {
      binding = { n: ++bindingNumber };
    },
  };
}

describe("createPerBindingProxy", () => {
  it("アクセスされるまでクライアントを生成しない（遅延解決）", () => {
    const { createClient } = setup();

    expect(createClient).not.toHaveBeenCalled();
  });

  it("同じバインディングの間は、生成済みのクライアントを使い回す", () => {
    const { proxy, createClient } = setup();

    expect(proxy.id).toBe(1);
    expect(proxy.user.findMany()).toBe("users@1");
    expect(proxy.id).toBe(1);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("バインディングが変わったら、クライアントを作り直す（リクエストごとの生成）", () => {
    const { proxy, createClient, switchBinding } = setup();

    expect(proxy.user.findMany()).toBe("users@1");
    switchBinding();
    expect(proxy.user.findMany()).toBe("users@2");
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("await や Promise.resolve が then を問い合わせても、バインディングの解決もクライアント生成も起こさない", async () => {
    const { proxy, createClient } = setup();

    const resolved = await Promise.resolve(proxy);

    expect(resolved).toBe(proxy);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("バインディングを取得できない状況でも、then・Symbol の問い合わせでは例外にならない", () => {
    const proxy = createPerBindingProxy(() => {
      throw new Error("リクエスト外");
    }, () => ({}));

    expect(() => (proxy as { then?: unknown }).then).not.toThrow();
    expect(() => (proxy as unknown as Record<symbol, unknown>)[Symbol.toPrimitive]).not.toThrow();
    expect(() => (proxy as { user?: unknown }).user).toThrow("リクエスト外");
  });

  it("メソッドは、プロキシではなくクライアント自身を this にして呼ばれる", () => {
    const { proxy } = setup();

    expect(proxy.self().id).toBe(1);
  });

  it("$disconnect は、生成済みのクライアントがあればそれを切断し、バインディングを取得しない", async () => {
    const { proxy, createClient } = setup();
    const disconnect = jest.fn();
    createClient.mockImplementationOnce(() => ({ id: 1, $disconnect: disconnect }) as never);

    expect(proxy.id).toBe(1);
    await proxy.$disconnect();

    expect(disconnect).toHaveBeenCalledTimes(1);
    // 切断後は、次のアクセスで新しいクライアントを作る
    expect(proxy.id).toBeDefined();
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("$disconnect は、バインディングを取得できない状況（リクエスト外・テストの終了処理）でも例外にならない", async () => {
    const proxy = createPerBindingProxy(() => {
      throw new Error("リクエスト外");
    }, () => ({}));

    await expect((proxy as unknown as { $disconnect: () => Promise<void> }).$disconnect()).resolves.toBeUndefined();
  });
});

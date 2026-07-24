import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { setMock, deleteMock, getStoreMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  deleteMock: vi.fn(),
  getStoreMock: vi.fn(),
}));

vi.mock("../src/lib/blobStore", () => ({
  getUploadsStore: getStoreMock,
}));

import {
  deleteActivityMediaFile,
  deleteChildPhotoFile,
  saveActivityMedia,
  saveChildPhoto,
  saveExpenseReceipt,
} from "../src/lib/upload";

function fakeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "photo.png",
    encoding: "7bit",
    mimetype: "image/png",
    buffer: Buffer.from("fake-image-bytes"),
    size: 16,
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never,
    ...overrides,
  };
}

describe("upload.ts — Netlify Blobs backend", () => {
  const originalNetlifyEnv = process.env.RUNNING_IN_NETLIFY_FUNCTION;

  beforeAll(() => {
    process.env.RUNNING_IN_NETLIFY_FUNCTION = "true";
    getStoreMock.mockReturnValue({ set: setMock, delete: deleteMock });
  });

  afterEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockReturnValue({ set: setMock, delete: deleteMock });
  });

  afterAll(() => {
    if (originalNetlifyEnv === undefined) {
      delete process.env.RUNNING_IN_NETLIFY_FUNCTION;
    } else {
      process.env.RUNNING_IN_NETLIFY_FUNCTION = originalNetlifyEnv;
    }
  });

  it("saves activity media to the blob store under an activities/ key", async () => {
    setMock.mockResolvedValue(undefined);
    const url = await saveActivityMedia(fakeFile());

    expect(url).toMatch(/^\/uploads\/activities\/.+\.png$/);
    expect(setMock).toHaveBeenCalledTimes(1);
    const [key, data, options] = setMock.mock.calls[0];
    expect(key).toBe(url.replace("/uploads/", ""));
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(options).toMatchObject({ metadata: { contentType: "image/png" } });
  });

  it("saves a child photo under a children/ key", async () => {
    setMock.mockResolvedValue(undefined);
    const url = await saveChildPhoto(fakeFile({ mimetype: "image/webp", originalname: "kid.webp" }));
    expect(url).toMatch(/^\/uploads\/children\/.+\.webp$/);
  });

  it("saves an expense receipt under a receipts/ key", async () => {
    setMock.mockResolvedValue(undefined);
    const url = await saveExpenseReceipt(fakeFile({ originalname: "receipt.jpg", mimetype: "image/jpeg" }));
    expect(url).toMatch(/^\/uploads\/receipts\/.+\.jpg$/);
  });

  it("deletes a blob using the key derived from its public URL", async () => {
    deleteMock.mockResolvedValue(undefined);
    await deleteActivityMediaFile("/uploads/activities/some-uuid.png");
    expect(deleteMock).toHaveBeenCalledWith("activities/some-uuid.png");
  });

  it("swallows a failed blob delete rather than throwing (logged, not fatal)", async () => {
    deleteMock.mockRejectedValue(new Error("network blip"));
    await expect(deleteChildPhotoFile("/uploads/children/some-uuid.png")).resolves.toBeUndefined();
  });
});

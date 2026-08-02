import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { PDF_EXTRACT_HTML } from "@/src/lib/pdfExtractHtml";

export type HiddenPdfExtractorHandle = {
  extractText: (base64: string) => Promise<string>;
  renderPages: (base64: string) => Promise<string[]>;
};

type Pending =
  | { kind: "text"; resolve: (text: string) => void; reject: (err: Error) => void }
  | { kind: "pages"; resolve: (pages: string[]) => void; reject: (err: Error) => void };

// Fully offline: runs Mozilla's pdf.js inside a hidden (0x0, invisible)
// WebView, library source embedded directly in the HTML — no network
// request, no CDN. Supports both real text-layer extraction and, as a
// fallback for image-only PDFs, rendering each page to a PNG for on-device
// OCR (see src/lib/ocrExtract.ts). Mount once anywhere in the tree.
const HiddenPdfExtractor = forwardRef<HiddenPdfExtractorHandle>((_props, ref) => {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<Pending | null>(null);
  const [, forceRerender] = useState(0);

  const waitForReadyThenSend = (payload: string, onTimeout: () => void) => {
    const send = () => webviewRef.current?.postMessage(payload);
    if (readyRef.current) {
      send();
      return;
    }
    const start = Date.now();
    const poll = setInterval(() => {
      if (readyRef.current) {
        clearInterval(poll);
        send();
      } else if (Date.now() - start > 10000) {
        clearInterval(poll);
        onTimeout();
      }
    }, 100);
  };

  useImperativeHandle(ref, () => ({
    extractText: (base64: string) =>
      new Promise<string>((resolve, reject) => {
        if (pendingRef.current) {
          reject(new Error("Another PDF operation is already in progress."));
          return;
        }
        pendingRef.current = { kind: "text", resolve, reject };
        waitForReadyThenSend(JSON.stringify({ type: "extractText", base64 }), () => {
          pendingRef.current = null;
          reject(new Error("PDF extractor did not become ready in time."));
        });
      }),
    renderPages: (base64: string) =>
      new Promise<string[]>((resolve, reject) => {
        if (pendingRef.current) {
          reject(new Error("Another PDF operation is already in progress."));
          return;
        }
        pendingRef.current = { kind: "pages", resolve, reject };
        waitForReadyThenSend(JSON.stringify({ type: "renderPages", base64 }), () => {
          pendingRef.current = null;
          reject(new Error("PDF extractor did not become ready in time."));
        });
      }),
  }));

  const onMessage = (event: any) => {
    let parsed: any;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (parsed.ready) {
      readyRef.current = true;
      forceRerender((n) => n + 1);
      return;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    if (!parsed.ok) {
      pending.reject(new Error(parsed.error || "PDF operation failed."));
      return;
    }
    if (pending.kind === "text") {
      pending.resolve(parsed.text as string);
    } else {
      pending.resolve(parsed.pages as string[]);
    }
  };

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none">
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html: PDF_EXTRACT_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
      />
    </View>
  );
});

export default HiddenPdfExtractor;

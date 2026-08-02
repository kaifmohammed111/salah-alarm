import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { PDF_EXTRACT_HTML } from "@/src/lib/pdfExtractHtml";

export type HiddenPdfExtractorHandle = {
  extractText: (base64: string) => Promise<string>;
};

// Fully offline PDF text extraction: runs Mozilla's pdf.js inside a hidden
// (0x0, invisible) WebView, with the library source embedded directly in
// the HTML (see pdfExtractHtml.ts) — no network request, no CDN. The PDF
// bytes go in via postMessage; the reconstructed text comes back the same
// way. Mount this once anywhere in the tree (it renders nothing visible)
// and call extractText() via the ref.
const HiddenPdfExtractor = forwardRef<HiddenPdfExtractorHandle>((_props, ref) => {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<{ resolve: (text: string) => void; reject: (err: Error) => void } | null>(null);
  const [, forceRerender] = useState(0);

  useImperativeHandle(ref, () => ({
    extractText: (base64: string) =>
      new Promise<string>((resolve, reject) => {
        if (pendingRef.current) {
          reject(new Error("Another PDF extraction is already in progress."));
          return;
        }
        pendingRef.current = { resolve, reject };
        const send = () => webviewRef.current?.postMessage(base64);
        if (readyRef.current) {
          send();
          return;
        }
        // Not ready yet (WebView / embedded pdf.js still initializing) —
        // poll briefly. In practice this finishes well under a second
        // since the library is embedded inline, not fetched.
        const start = Date.now();
        const poll = setInterval(() => {
          if (readyRef.current) {
            clearInterval(poll);
            send();
          } else if (Date.now() - start > 10000) {
            clearInterval(poll);
            pendingRef.current = null;
            reject(new Error("PDF extractor did not become ready in time."));
          }
        }, 100);
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
    if (parsed.ok) {
      pending.resolve(parsed.text as string);
    } else {
      pending.reject(new Error(parsed.error || "PDF text extraction failed."));
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

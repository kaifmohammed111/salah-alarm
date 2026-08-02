import { PDFJS_LIB_SOURCE, PDFJS_WORKER_SOURCE } from "./pdfjsSource.generated";

// Builds the offline HTML page loaded into the hidden WebView. Both the
// pdf.js library AND its worker script are embedded directly (see
// pdfjsSource.generated.ts) — nothing here ever fetches from a CDN or
// network. pdf.js requires a worker script even in "fake worker" mode, so
// rather than trying to suppress that, the worker source is turned into a
// Blob URL at runtime (URL.createObjectURL) and pdf.js loads it from
// there — still fully offline, just served from memory instead of a URL.
//
// Table-row reconstruction: pdf.js's getTextContent() returns a flat list
// of positioned text fragments, not lines. We cluster fragments by Y
// coordinate (small tolerance for baseline jitter) to rebuild visual rows,
// then sort each row's fragments left-to-right by X coordinate.
export const PDF_EXTRACT_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>${PDFJS_LIB_SOURCE}</script>
<script>
  var workerSource = ${JSON.stringify(PDFJS_WORKER_SOURCE)};
  var workerBlob = new Blob([workerSource], { type: "application/javascript" });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

  function b64ToUint8Array(b64) {
    var binary = atob(b64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function linesFromTextContent(textContent) {
    var items = textContent.items.slice().sort(function (a, b) {
      return b.transform[5] - a.transform[5]; // top to bottom
    });
    var lines = [];
    var current = null;
    var currentY = null;
    var TOLERANCE = 3;
    items.forEach(function (item) {
      var y = item.transform[5];
      if (current === null || Math.abs(y - currentY) > TOLERANCE) {
        current = [];
        currentY = y;
        lines.push(current);
      }
      current.push(item);
    });
    return lines
      .map(function (line) {
        return line
          .sort(function (a, b) { return a.transform[4] - b.transform[4]; })
          .map(function (i) { return i.str; })
          .join(" ")
          .replace(/\\s+/g, " ")
          .trim();
      })
      .filter(function (l) { return l.length > 0; });
  }

  async function extractAllText(base64) {
    var bytes = b64ToUint8Array(base64);
    var doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    var allLines = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var textContent = await page.getTextContent();
      allLines = allLines.concat(linesFromTextContent(textContent));
    }
    return allLines.join("\\n");
  }

  function handleMessage(data) {
    extractAllText(data)
      .then(function (text) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, text: text }));
      })
      .catch(function (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
      });
  }

  // Android fires message events on document, iOS fires them on window —
  // a well-known react-native-webview platform quirk, hence both listeners.
  window.addEventListener("message", function (event) { handleMessage(event.data); });
  document.addEventListener("message", function (event) { handleMessage(event.data); });

  window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, ready: true }));
</script>
</body>
</html>
`;

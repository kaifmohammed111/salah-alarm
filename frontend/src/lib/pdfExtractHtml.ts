import { PDFJS_LIB_SOURCE, PDFJS_WORKER_SOURCE } from "./pdfjsSource.generated";

// Builds the offline HTML page loaded into the hidden WebView. Both the
// pdf.js library AND its worker script are embedded directly — nothing
// here ever fetches from a CDN or network.
//
// Two request types, sent as JSON via postMessage:
//   { type: "extractText", base64 }  -> real text layer, when the PDF has one
//   { type: "renderPages",  base64 } -> renders each page to a PNG, for
//                                       PDFs with no text layer at all
//                                       (e.g. a scanned/photographed poster),
//                                       so the RN side can run on-device OCR
//                                       on the images instead.
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
      return b.transform[5] - a.transform[5];
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

  // Renders each page to a PNG at 2x scale (better OCR accuracy on small
  // print) and returns an array of base64 PNG strings, one per page.
  async function renderAllPages(base64) {
    var bytes = b64ToUint8Array(base64);
    var doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    var pages = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var viewport = page.getViewport({ scale: 2.0 });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var dataUrl = canvas.toDataURL("image/png");
      pages.push(dataUrl.split(",")[1]);
    }
    return pages;
  }

  function handleMessage(raw) {
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      msg = { type: "extractText", base64: raw };
    }
    if (msg.type === "renderPages") {
      renderAllPages(msg.base64)
        .then(function (pages) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, pages: pages }));
        })
        .catch(function (err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
        });
      return;
    }
    extractAllText(msg.base64)
      .then(function (text) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, text: text }));
      })
      .catch(function (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
      });
  }

  window.addEventListener("message", function (event) { handleMessage(event.data); });
  document.addEventListener("message", function (event) { handleMessage(event.data); });

  window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, ready: true }));
</script>
</body>
</html>
`;

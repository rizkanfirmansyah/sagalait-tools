/* Web Worker: menjalankan pencocokan di luar thread utama agar pola lambat tidak membekukan halaman. */
importScripts('rx.js');
self.onmessage = function (e) {
  var d = e.data;
  self.postMessage({ id: d.id, res: self.Rx.run(d) });
};

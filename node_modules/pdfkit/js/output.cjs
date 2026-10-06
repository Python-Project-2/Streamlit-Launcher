'use strict';

const collect = document => new Promise((resolve, reject) => {
  const chunks = [];
  let length = 0;
  const cleanup = () => {
    document.off('data', onData);
    document.off('end', onEnd);
    document.off('error', onError);
  };
  const onData = chunk => {
    chunks.push(chunk);
    length += chunk.byteLength;
  };
  const onEnd = () => {
    cleanup();
    resolve({
      chunks,
      length
    });
  };
  const onError = error => {
    cleanup();
    reject(error);
  };
  document.on('data', onData);
  document.on('end', onEnd);
  document.on('error', onError);
});
async function toBlob(document) {
  const {
    chunks
  } = await collect(document);
  return new Blob(chunks, {
    type: 'application/pdf'
  });
}
async function toBytes(document) {
  const {
    chunks,
    length
  } = await collect(document);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

exports.toBlob = toBlob;
exports.toBytes = toBytes;

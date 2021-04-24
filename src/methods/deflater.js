// const { Buffer } = require('buffer/')
const zlib = require("zlib");

const deflate = (/* Buffer */ inbuf) => {
    const opts = { chunkSize: (parseInt(inbuf.length / 1024, 10) + 1) * 1024 };
    return zlib.deflateRawSync(inbuf, opts);
}

module.exports = { deflate }


// module.exports = function (/* Buffer */ inbuf) {

//     const opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };

//     return {
//         deflate () {
//             return zlib.deflateRawSync(inbuf, opts);
//         },

//         deflateAsync (/* Function */ callback) {
//             const tmp = zlib.createDeflateRaw(opts);
//                 const parts = [];
//                 let total = 0;
//             tmp.on("data", (data) => {
//                 parts.push(data);
//                 total += data.length;
//             });
//             tmp.on("end", () => {
//                 const buf = Buffer.alloc(total);
//                     let written = 0;
//                 buf.fill(0);
//                 for (let i = 0; i < parts.length; i++) {
//                     const part = parts[i];
//                     part.copy(buf, written);
//                     written += part.length;
//                 }
//                 callback && callback(buf);
//             });
//             tmp.end(inbuf);
//         }
//     };
// };

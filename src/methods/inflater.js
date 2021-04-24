// const { Buffer } = require('buffer/')
const zlib = require("zlib");

const inflate = (/* Buffer */ inbuf) => zlib.inflateRawSync(inbuf)

module.exports = { inflate }

// module.exports = function (/* Buffer */ inbuf) {
//     return {
//         inflate () {
//             return zlib.inflateRawSync(inbuf);
//         },

//         inflateAsync (/* Function */ callback) {
//             const tmp = zlib.createInflateRaw();
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

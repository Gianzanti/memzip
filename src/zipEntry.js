/* eslint-disable no-case-declarations */
const { Buffer } = require('buffer/')
const isBuffer = require('is-buffer')
const Utils = require("./util");
const Headers = require("./headers");

const {Constants} = Utils;
const Methods = require("./methods");

module.exports = function (/* Buffer */ input) {
    const _entryHeader = new Headers.EntryHeader();
        let _entryName = Buffer.alloc(0);
        let _comment = Buffer.alloc(0);
        let _isDirectory = false;
        let uncompressedData = null;
        let _extra = Buffer.alloc(0);

    function getCompressedDataFromZip() {
        if (!input || !isBuffer(input)) {
            return Buffer.alloc(0);
        }
        _entryHeader.loadDataHeaderFromBinary(input);
        return input.slice(_entryHeader.realDataOffset, _entryHeader.realDataOffset + _entryHeader.compressedSize);
    }

    function crc32OK(data) {
        // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
        if ((_entryHeader.flags & 0x8) !== 0x8) {
            if (Utils.crc32(data) !== _entryHeader.dataHeader.crc) {
                return false;
            }
        } else {
            // @TODO: load and check data descriptor header
            // The fields in the local header are filled with zero, and the CRC-32 and size are appended in a 12-byte structure
            // (optionally preceded by a 4-byte signature) immediately after the compressed data:
        }
        return true;
    }

    function decompress(/* Boolean */ async, /* Function */ callback, /* String, Buffer */ pass) {
        if (typeof callback === "undefined" && typeof async === "string") {
            pass = async;
            async = void 0;
        }
        if (_isDirectory) {
            if (async && callback) {
                callback(Buffer.alloc(0), Utils.Errors.DIRECTORY_CONTENT_ERROR); // si added error.
            }
            return Buffer.alloc(0);
        }

        let compressedData = getCompressedDataFromZip();

        if (compressedData.length === 0) {
            // File is empty, nothing to decompress.
            if (async && callback) callback(compressedData);
            return compressedData;
        }

        if (_entryHeader.encripted) {
            if (typeof pass !== "string" && !isBuffer(pass)) {
                throw new Error("ADM-ZIP: Incompatible password parameter");
            }
            compressedData = Methods.ZipCrypto.decrypt(compressedData, _entryHeader, pass);
        }

        const data = Buffer.alloc(_entryHeader.size);

        switch (_entryHeader.method) {
            case Utils.Constants.STORED:
                compressedData.copy(data);
                if (!crc32OK(data)) {
                    if (async && callback) callback(data, Utils.Errors.BAD_CRC); // si added error
                    throw new Error(Utils.Errors.BAD_CRC);
                } else {
                    // si added otherwise did not seem to return data.
                    if (async && callback) callback(data);
                    return data;
                }
            case Utils.Constants.DEFLATED:
                // var inflater = new Methods.Inflater(compressedData);
                // if (!async) {
                    const result = Methods.Inflater.inflate(data);
                    result.copy(data, 0);
                    if (!crc32OK(data)) {
                        throw new Error(`${Utils.Errors.BAD_CRC  } ${  _entryName.toString()}`);
                    }
                    return data;
                // } 
                //     inflater.inflateAsync((result) => {
                //         result.copy(result, 0);
                //         if (callback) {
                //             if (!crc32OK(result)) {
                //                 callback(result, Utils.Errors.BAD_CRC); // si added error
                //             } else {
                //                 callback(result);
                //             }
                //         }
                //     });
                
                // break;
            default:
                if (async && callback) callback(Buffer.alloc(0), Utils.Errors.UNKNOWN_METHOD);
                throw new Error(Utils.Errors.UNKNOWN_METHOD);
        }
    }

    function compress(/* Boolean */ async, /* Function */ callback) {
        if ((!uncompressedData || !uncompressedData.length) && isBuffer(input)) {
            // no data set or the data wasn't changed to require recompression
            if (async && callback) callback(getCompressedDataFromZip());
            return getCompressedDataFromZip();
        }

        if (uncompressedData.length && !_isDirectory) {
            let compressedData;
            // Local file header
            switch (_entryHeader.method) {
                case Utils.Constants.STORED:
                    _entryHeader.compressedSize = _entryHeader.size;

                    compressedData = Buffer.alloc(uncompressedData.length);
                    uncompressedData.copy(compressedData);

                    if (async && callback) callback(compressedData);
                    return compressedData;
                default:
                case Utils.Constants.DEFLATED:
                    // var deflater = new Methods.Deflater(uncompressedData);
                    // if (!async) {
                    const deflated = Methods.Deflater.deflate(uncompressedData);
                    _entryHeader.compressedSize = deflated.length;
                    return deflated;
                    // } 
                    //     deflater.deflateAsync((data) => {
                    //         compressedData = Buffer.alloc(data.length);
                    //         _entryHeader.compressedSize = data.length;
                    //         data.copy(compressedData);
                    //         callback && callback(compressedData);
                    //     });
                    
                    // deflater = null;
                    // break;
            }
        } else if (async && callback) {
            callback(Buffer.alloc(0));
        } else {
            return Buffer.alloc(0);
        }
    }

    function readUInt64LE(buffer, offset) {
        return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
    }

    function parseExtra(data) {
        let offset = 0;
        let signature; let size; let part;
        while (offset < data.length) {
            signature = data.readUInt16LE(offset);
            offset += 2;
            size = data.readUInt16LE(offset);
            offset += 2;
            part = data.slice(offset, offset + size);
            offset += size;
            if (Constants.ID_ZIP64 === signature) {
                parseZip64ExtendedInformation(part);
            }
        }
    }

    // Override header field values with values from the ZIP64 extra field
    function parseZip64ExtendedInformation(data) {
        let size; let compressedSize; let offset; let diskNumStart;

        if (data.length >= Constants.EF_ZIP64_SCOMP) {
            size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
            if (_entryHeader.size === Constants.EF_ZIP64_OR_32) {
                _entryHeader.size = size;
            }
        }
        if (data.length >= Constants.EF_ZIP64_RHO) {
            compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
            if (_entryHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
                _entryHeader.compressedSize = compressedSize;
            }
        }
        if (data.length >= Constants.EF_ZIP64_DSN) {
            offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
            if (_entryHeader.offset === Constants.EF_ZIP64_OR_32) {
                _entryHeader.offset = offset;
            }
        }
        if (data.length >= Constants.EF_ZIP64_DSN + 4) {
            diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
            if (_entryHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
                _entryHeader.diskNumStart = diskNumStart;
            }
        }
    }

    return {
        get entryName() {
            return _entryName.toString();
        },
        get rawEntryName() {
            return _entryName;
        },
        set entryName(val) {
            _entryName = Utils.toBuffer(val);
            const lastChar = _entryName[_entryName.length - 1];
            _isDirectory = lastChar === 47 || lastChar === 92;
            _entryHeader.fileNameLength = _entryName.length;
        },

        get extra() {
            return _extra;
        },
        set extra(val) {
            _extra = val;
            _entryHeader.extraLength = val.length;
            parseExtra(val);
        },

        get comment() {
            return _comment.toString();
        },
        set comment(val) {
            _comment = Utils.toBuffer(val);
            _entryHeader.commentLength = _comment.length;
        },

        get name() {
            const n = _entryName.toString();
            return _isDirectory
                ? n
                      .substr(n.length - 1)
                      .split("/")
                      .pop()
                : n.split("/").pop();
        },
        get isDirectory() {
            return _isDirectory;
        },

        getCompressedData () {
            return compress(false, null);
        },

        getCompressedDataAsync (/* Function */ callback) {
            compress(true, callback);
        },

        setData (value) {
            uncompressedData = Utils.toBuffer(value);
            if (!_isDirectory && uncompressedData.length) {
                _entryHeader.size = uncompressedData.length;
                _entryHeader.method = Utils.Constants.DEFLATED;
                _entryHeader.crc = Utils.crc32(value);
                _entryHeader.changed = true;
            } else {
                // folders and blank files should be stored
                _entryHeader.method = Utils.Constants.STORED;
            }
        },

        getData (pass) {
            if (_entryHeader.changed) {
                return uncompressedData;
            } 
                return decompress(false, null, pass);
            
        },

        getDataAsync (/* Function */ callback, pass) {
            if (_entryHeader.changed) {
                callback(uncompressedData);
            } else {
                decompress(true, callback, pass);
            }
        },

        set attr(attr) {
            _entryHeader.attr = attr;
        },
        get attr() {
            return _entryHeader.attr;
        },

        set header(/* Buffer */ data) {
            _entryHeader.loadFromBinary(data);
        },

        get header() {
            return _entryHeader;
        },

        packHeader () {
            // 1. create header (buffer)
            const header = _entryHeader.entryHeaderToBinary();
            let addpos = Utils.Constants.CENHDR;
            // 2. add file name
            _entryName.copy(header, addpos);
            addpos += _entryName.length;
            // 3. add extra data
            if (_entryHeader.extraLength) {
                _extra.copy(header, addpos);
                addpos += _entryHeader.extraLength;
            }
            // 4. add file comment
            if (_entryHeader.commentLength) {
                _comment.copy(header, addpos);
            }
            return header;
        },

        toJSON () {
            const bytes = function (nr) {
                return `<${  (nr && `${nr.length  } bytes buffer`) || "null"  }>`;
            };

            return {
                entryName: this.entryName,
                name: this.name,
                comment: this.comment,
                isDirectory: this.isDirectory,
                header: _entryHeader.toJSON(),
                compressedData: bytes(input),
                data: bytes(uncompressedData)
            };
        },

        toString () {
            return JSON.stringify(this.toJSON(), null, "\t");
        }
    };
};

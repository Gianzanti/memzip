const pth = require("path");
const Utils = require("./util");
const ZipEntry = require("./zipEntry");
const ZipFile = require("./zipFile");

const defaultOptions = {
    // option "noSort" : if true it disables files sorting
    noSort: false,
    // read entries during load (initial loading may be slower)
    readEntries: false,
    // default method is none
    method: Utils.Constants.NONE
};

module.exports = function (/** String */ input, /** object */ options) {
    let inBuffer = null;

    // create object based default options, allowing them to be overwritten
    const opts = Object.assign(Object.create(null), defaultOptions);

    // test input variable
    if (input && typeof input === "object") {
        // if value is not buffer we accept it to be object with options
        if (!(input instanceof Uint8Array)) {
            Object.assign(opts, input);
            input = opts.input ? opts.input : undefined;
            if (opts.input) delete opts.input;
        }

        // if input is buffer
        if (input instanceof Uint8Array) {
            inBuffer = input;
            opts.method = Utils.Constants.BUFFER;
            input = undefined;
        }
    }

    // assign options
    Object.assign(opts, options);

    // if input is file name we retrieve its content
    if (input && typeof input === "string") {
        throw new Error(Utils.Errors.INVALID_FILENAME);
    }

    // create variable
    const _zip = new ZipFile(inBuffer, opts);

    function sanitize(prefix, name) {
        prefix = pth.resolve(pth.normalize(prefix));
        const parts = name.split("/");
        for (let i = 0, l = parts.length; i < l; i++) {
            const path = pth.normalize(pth.join(prefix, parts.slice(i, l).join(pth.sep)));
            if (path.indexOf(prefix) === 0) {
                return path;
            }
        }
        return pth.normalize(pth.join(prefix, pth.basename(name)));
    }

    function getEntry(/** Object */ entry) {
        if (entry && _zip) {
            let item;
            // If entry was given as a file name
            if (typeof entry === "string") item = _zip.getEntry(entry);
            // if entry was given as a ZipEntry object
            if (typeof entry === "object" && typeof entry.entryName !== "undefined" && typeof entry.header !== "undefined") item = _zip.getEntry(entry.entryName);

            if (item) {
                return item;
            }
        }
        return null;
    }

    return {
        /**
         * Extracts the given entry from the archive and returns the content as a Buffer object
         * @param entry ZipEntry object or String with the full path of the entry
         *
         * @return Buffer or Null in case of error
         */
        readFile (/** Object */ entry, /* String, Buffer */ pass) {
            const item = getEntry(entry);
            return (item && item.getData(pass)) || null;
        },

        /**
         * Asynchronous readFile
         * @param entry ZipEntry object or String with the full path of the entry
         * @param callback
         *
         * @return Buffer or Null in case of error
         */
        readFileAsync (/** Object */ entry, /** Function */ callback) {
            const item = getEntry(entry);
            if (item) {
                item.getDataAsync(callback);
            } else {
                callback(null, `getEntry failed for:${  entry}`);
            }
        },

        /**
         * Extracts the given entry from the archive and returns the content as plain text in the given encoding
         * @param entry ZipEntry object or String with the full path of the entry
         * @param encoding Optional. If no encoding is specified utf8 is used
         *
         * @return String
         */
        readAsText (/** Object */ entry, /** String= */ encoding) {
            const item = getEntry(entry);
            if (item) {
                const data = item.getData();
                if (data && data.length) {
                    return data.toString(encoding || "utf8");
                }
            }
            return "";
        },

        /**
         * Asynchronous readAsText
         * @param entry ZipEntry object or String with the full path of the entry
         * @param callback
         * @param encoding Optional. If no encoding is specified utf8 is used
         *
         * @return String
         */
        readAsTextAsync (/** Object */ entry, /** Function */ callback, /** String= */ encoding) {
            const item = getEntry(entry);
            if (item) {
                item.getDataAsync((data, err) => {
                    if (err) {
                        callback(data, err);
                        return;
                    }

                    if (data && data.length) {
                        callback(data.toString(encoding || "utf8"));
                    } else {
                        callback("");
                    }
                });
            } else {
                callback("");
            }
        },

        /**
         * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
         *
         * @param entry
         */
        deleteFile (/** Object */ entry) {
            // @TODO: test deleteFile
            const item = getEntry(entry);
            if (item) {
                _zip.deleteEntry(item.entryName);
            }
        },

        /**
         * Adds a comment to the zip. The zip must be rewritten after adding the comment.
         *
         * @param comment
         */
        addZipComment (/** String */ comment) {
            // @TODO: test addZipComment
            _zip.comment = comment;
        },

        /**
         * Returns the zip comment
         *
         * @return String
         */
        getZipComment () {
            return _zip.comment || "";
        },

        /**
         * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
         * The comment cannot exceed 65535 characters in length
         *
         * @param entry
         * @param comment
         */
        addZipEntryComment (/** Object */ entry, /** String */ comment) {
            const item = getEntry(entry);
            if (item) {
                item.comment = comment;
            }
        },

        /**
         * Returns the comment of the specified entry
         *
         * @param entry
         * @return String
         */
        getZipEntryComment (/** Object */ entry) {
            const item = getEntry(entry);
            if (item) {
                return item.comment || "";
            }
            return "";
        },

        /**
         * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
         *
         * @param entry
         * @param content
         */
        updateFile (/** Object */ entry, /** Buffer */ content) {
            const item = getEntry(entry);
            if (item) {
                item.setData(content);
            }
        },

        /**
         *
         * @param {string} localPath - path where files will be extracted
         * @param {object} props - optional properties
         * @param {string} props.zipPath - optional path inside zip
         * @param {regexp, function} props.filter - RegExp or Function if files match will be included.
         */
        addLocalFolderPromise (/* String */ localPath, /* object */ props) {
            return new Promise((resolve, reject) => {
                const { filter, zipPath } = { ...props};
                this.addLocalFolderAsync(
                    localPath,
                    (done, err) => {
                        if (err) reject(err);
                        if (done) resolve(this);
                    },
                    zipPath,
                    filter
                );
            });
        },

        /**
         * Allows you to create a entry (file or directory) in the zip file.
         * If you want to create a directory the entryName must end in / and a null buffer should be provided.
         * Comment and attributes are optional
         *
         * @param {string} entryName
         * @param {Buffer | string} content - file content as buffer or utf8 coded string
         * @param {string} comment - file comment
         * @param {number | object} attr - number as unix file permissions, object as filesystem Stats object
         */
        addFile (/** String */ entryName, /** Buffer */ content, /** String */ comment, /** Number */ attr) {
            let entry = getEntry(entryName);
            const update = entry != null;

            // prepare new entry
            if (!update) {
                entry = new ZipEntry();
                entry.entryName = entryName;
            }
            entry.comment = comment || "";

            // Set file attribute
            let fileattr = entry.isDirectory ? 0x10 : 0; // (MS-DOS directory flag)

            // extended attributes field for Unix
            if (!Utils.isWin) {
                // set file type either S_IFDIR / S_IFREG
                let unix = entry.isDirectory ? 0x4000 : 0x8000;

                if (typeof attr === "number") {
                    // attr from given attr values
                    unix |= 0xfff & attr;
                } else {
                    // Default values:
                    unix |= entry.isDirectory ? 0o755 : 0o644; // permissions (drwxr-xr-x) or (-r-wr--r--)
                }

                fileattr = (fileattr | (unix << 16)) >>> 0; // add attributes
            }

            entry.attr = fileattr;

            entry.setData(content);
            if (!update) _zip.setEntry(entry);
        },

        /**
         * Returns an array of ZipEntry objects representing the files and folders inside the archive
         *
         * @return Array
         */
        getEntries () {
            return _zip ? _zip.entries : [];
        },

        /**
         * Returns a ZipEntry object representing the file or folder specified by ``name``.
         *
         * @param name
         * @return ZipEntry
         */
        getEntry (/** String */ name) {
            return getEntry(name);
        },

        getEntryCount () {
            return _zip.getEntryCount();
        },

        forEach (callback) {
            return _zip.forEach(callback);
        },


        /**
         * Test the archive
         *
         */
        test (pass) {
            if (!_zip) {
                return false;
            }

            for (const entry in _zip.entries) {
                try {
                    if (entry.isDirectory) {
                        continue;
                    }
                    const content = _zip.entries[entry].getData(pass);
                    if (!content) {
                        return false;
                    }
                } catch (err) {
                    return false;
                }
            }
            return true;
        },

        toBufferPromise () {
            return new Promise((resolve, reject) => {
                _zip.toAsyncBuffer(resolve, reject);
            });
        },

        /**
         * Returns the content of the entire zip file as a Buffer object
         *
         * @return Buffer
         */
        toBuffer () {
            return _zip.compressToBuffer();
        }
    };
};

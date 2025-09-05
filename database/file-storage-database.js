const fs = require('fs');
const path = require('path');

const query = (q, data) => {
    this.limit = (limit) => {
        this.limitation = limit;
        return this;
    }
    this.skip = (skip) => {
        this.skipation = skip;
        return this;
    }
    this.count = async () => {
        return await new Promise((resolve) => {
            resolve(this.toArray().length);
        });
    }
    this.toArray = async () => {
        return await new Promise((resolve) => {
            let copyOfData = [];
            let isFirstPass = true
            if (q == undefined || Object.keys(q).length == 0) {
                copyOfData = data;
            } else {
                for (let key of Object.keys(q)) {
                    if (isFirstPass) {
                        let item = data.find(x => x[key] == q[key]);
                        if (item) {
                            copyOfData.push(item);
                        }
                    } else {
                        copyOfData = copyOfData.map(x => {
                            if (x[key] == q[key]) {
                                return x;
                            }
                            return null;
                        }).filter(x => x != null);
                    }
                }
            }
            if (this.limitation != undefined && this.limit != undefined) {
                copyOfData = copyOfData.slice(this.skipation, this.skipation + this.limitation);
            }
            if (this.skipation != undefined) {
                copyOfData = copyOfData.slice(this.skipation);
            }
            if (this.limitation != undefined) {
                copyOfData = copyOfData.slice(0, this.limitation);
            }
            resolve(copyOfData);
        });
    }
    return this;
}

const database = function(directory) {
    this.load = (directory) => {
        this.directory = directory;
        return this;
    }
    this.save = () => {
        fs.writeFileSync(path.join(this.directory, this.name), JSON.stringify(this.data, null, 2));
    }
    this.collection = (name) => {
        if (this.name == name) {
            return this;
        }
        if (!fs.existsSync(path.join(this.directory, name))) {
            fs.writeFileSync(path.join(this.directory, name), JSON.stringify([], null, 2));
        }
        this.data = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8'));
        this.name = name;
        return this;
    }
    this.find = (q) => {
        return query(q, this.data);
    }
    this.insert = async (item) => {
        if (item.id == undefined) {
            throw new Error('Item id is undefined');
        }
        if (this.data.find(x => x.id == item.id)) {
            await this.updateOne({ id: item.id }, item);
            return;
        }
        this.data.push(item);
        this.save();
    }
    this.update = async (item) => {
        if (item.id == undefined) {
            throw new Error('Item id is undefined');
        }
        if (this.data.find(x => x.id == item.id)) {
            await this.updateOne({ id: item.id }, item);
            return;
        }
        this.data.push(item);
        this.save();
    }

    this.updateOne = async (q, item) => {
        let targetItem = this.data.find(x => x.id == q.id);

        if (targetItem == undefined) {
            this.data.push(item);
            this.save();
            return item;
        }

        if (item.$set != undefined) {
            for (let key of Object.keys(item.$set)) {
                targetItem[key] = item.$set[key];
            }
            this.save();
            return targetItem;
        } else {
            this.data = this.data.map(x => {
                if (x.id == item.id) {
                    return item;
                }
                return x;
            });

            this.save();
            return item;
        }
    }

    this.data = [];
    this.name = undefined;
    this.directory = directory;
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
    return this;
}

module.exports = {
    database: database
}
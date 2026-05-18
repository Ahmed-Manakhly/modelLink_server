class APIFeatures {
    constructor(queryString) {
        this.queryString = queryString;
    }

    filter() {
        const queryObj = {...this.queryString};
        const excludedFields = ["page", "sort", "limit", "fields"];
        excludedFields.forEach((el) => delete queryObj[el]);

        // 1B) Advanced filtering
        let queryStr = JSON.stringify(queryObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `${(match)}`);

        // @TODO: Fix the numbers in the query string

        this.where = JSON.parse(queryStr)

        return this;
    }

    sort() {
        if (this.queryString.sort) {
            this.orderBy = this.queryString.sort.split(",").join(" ")
        } else {
            this.orderBy = {
                id: "asc"
            }
        }
        return this;
    }

    limitFields() {
        if (this.queryString.fields) {
            let select =  this.queryString.fields.split(",").join(" ")
            this.select = {
                ...select.split(" ").reduce((obj, field) => {
                    obj[field] = true;
                    return obj;
                }, {})
            }
        } else {
            this.select = null
        }
        return this;
    }

    paginate() {
        const page = this.queryString.page * 1 || 1;
        const limit = this.queryString.limit * 1 || 100;
        this.skip = (page - 1) * limit;
        this.take= limit

        return this;
    }
}

module.exports = APIFeatures;

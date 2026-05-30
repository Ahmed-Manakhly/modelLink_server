class ApiFeatures {
    constructor(model, reqQuery, options = {} ,specialSelect= null ,mandatorySelect) {
        this.model = model;
        this.reqQuery = reqQuery;
        this.options = {
            defaultRelations: {},
            defaultSort: { id: 'asc' },
            defaultLimit: 12,
            allowableFields: [],
            exactMatchFields: [],
            fieldConfigs: {}, // new: field type map (scalar, array-primitive, relation-object, relation-array)
            searchFields: [],
            ...options,
        };
        this.specialSelect = specialSelect ,
        this.mandatorySelect = mandatorySelect
        this.query = {
            where: { AND: [] },
            orderBy: this.options.defaultSort,
            skip: 0,
            take: this.options.defaultLimit,
        };
        this.counts = { total: 0, filtered: 0 };
        this.pagination = {
            page: 1,
            limit: this.options.defaultLimit,
            total_pages: 1,
            next_Page: null,
            page_data_count: 0,
        };
        this.error = null;
    }
    buildSelectObject(fields) {
        const select = {};
        fields.forEach(field => {
            // if (!this.options.allowableFields.includes(field)) return;
            const parts = field.split('.');
            let current = select;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    current[part] = true;
                } else {
                    if (!current[part]) current[part] = { select: {} };
                    current = current[part].select;
                }
            }
        });
        return select;
    }
    buildSpecialSelectObject(field, select, value) {
        const parts = field.split('.');
        let current = select;
        let parent = null;
        let parentKey = null;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            // Save parent for possible override
            parent = current;
            parentKey = part;
            if (!current[part]) return select;
            // If it's a scalar true (select: true), replace with object to allow where
            // if (current[part] === true) {
            //     current[part] = { select: {} };  // promote to object for where
            // }
            if (isLast) {
                // Case: already has object, inject where
                if (typeof current[part] === 'object') {
                    current[part].where = value;
                }
                if (current[part] === true) {
                    current[part] = { where: value };
                }
            } else {
                if (!current[part].select) return select;
                current = current[part].select;
            }
        }
        return select;
    }
    processFieldSelection() {
        if (this.reqQuery.fields) {
            const fields = this.reqQuery.fields.split(',');
            fields.forEach(field => {
                if (!this.options.allowableFields.includes(field)){
                    this.error = `Invalid field: ${field}`;
                    return this
                }
            });
            // fields.sort((a, b) => a.split('.').length - b.split('.').length);
            // //revers the sort order
            fields.sort((a, b) => b.split('.').length - a.split('.').length);
            const selection = this.buildSelectObject(fields);
            if(this.specialSelect){
                const  entries = Object.entries(this.specialSelect)
                for (const [field, value] of entries) {
                    this.query.select = this.buildSpecialSelectObject(field , selection , value)
                }
            }else{
                this.query.select = selection;
            }
        } else if (this.mandatorySelect && !this.reqQuery.fields && !this.specialSelect) {
            this.query.select = {...this.mandatorySelect };
        }else {
            this.query.include = this.options.defaultRelations;
        }
        return this;
    }
    buildWhereObject(fieldPath, value) {
        const config = this.options.fieldConfigs || {};
        const parts = fieldPath.split('.');
        let current = {};
        let pointer = current;
        for (let i = 0; i < parts.length; i++) {
            const subPath = parts.slice(0, i + 1).join('.');
            const fieldType = config[subPath] || 'scalar';
            const key = parts[i];
            const isLast = i === parts.length - 1;
            if (fieldType === 'relation-array') {
                pointer[key] = { some: {} };
                pointer = pointer[key].some;
            } else if (fieldType === 'array-primitive') {
                pointer[key] = { has: value };
                return current;
            } else if (isLast) {
                pointer[key] = value;
            } else {
            if (!pointer[key]) pointer[key] = {};
                pointer = pointer[key];
            }
        }
        return current;
    }
    processFilters() {
        const entries = Object.entries(this.reqQuery);
        const rangeConditions = {}; // Track range conditions by field

        // First pass: Collect range conditions
        for (const [field, value] of entries) {
            if (field.endsWith('From') || field.endsWith('To')) {
                const baseField = field.replace(/(From|To)$/, '');
                if (!rangeConditions[baseField]) rangeConditions[baseField] = {};
                
                if (field.endsWith('From')) {
                    rangeConditions[baseField].gte = value;
                } else {
                    rangeConditions[baseField].lte = value;
                }
            }
        }

        for (const [field, value] of entries) {
            if (["page", "limit", "sort", "fields"].includes(field) || 
                field.endsWith("Rule") || 
                field.endsWith("From") || 
                field.endsWith("To")) continue;
            // -----------------------------------------------------
            // ✅ Global Search Handling
            if (field === 'search') {
                if (!this.options.searchFields?.length) continue;
                const or = { OR: [] };
                this.options.searchFields.forEach(searchField => {
                    const condition = { contains: value, mode: 'insensitive' };
                    const where = this.buildWhereObject(searchField, condition);
                    or.OR.push(where);
                });
                this.query.where.AND.push(or);
                continue; // ✅ Important: avoid further processing `search`
            }
            // -----------------------------------------------------
            if (!this.options.allowableFields.includes(field)){
                this.error = `Invalid field: ${field}`;
                return this
            }
            // -----------------------------------------------------
            let condition;
            const rule = this.reqQuery[`${field}Rule`];
            // -----------------------------------------
            // Handle date range if exists
            if (rangeConditions[field]) {
                condition = {};
                if (rangeConditions[field].gte) {
                    const dateVal = new Date(rangeConditions[field].gte);
                    if (!isNaN(dateVal)) condition.gte = dateVal;
                }
                if (rangeConditions[field].lte) {
                    const dateVal = new Date(rangeConditions[field].lte);
                    if (!isNaN(dateVal)) condition.lte = dateVal;
                }
            }
            // -----------------------------------------
            if (['true', 'false', 'yes', 'no'].includes(value)) {
                condition = { equals: value === 'true' || value === 'yes' };
            } else if (rule && ['lt', 'lte', 'gt', 'gte', 'equals'].includes(rule)) {
                const date = new Date(value);
                const isDate = !isNaN(date) && /^\d{4}-\d{2}-\d{2}/.test(value); // check it's likely a date
                condition = isDate ? { [rule]: date } : { [rule]: Number(value) };
            } else if (this.options.exactMatchFields.includes(field)) {
                condition = value ;
            } else {
                condition = { contains: value, mode: 'insensitive' };
            }
            // Only add condition if it's valid
            if (condition && Object.keys(condition).length > 0) {                
                const where = this.buildWhereObject(field, condition);
                this.query.where.AND.push(where);
            }
        }
        for (const [field, condition] of Object.entries(rangeConditions)) {
            if (!this.options.allowableFields.includes(field)) continue;
        
            const gte = condition.gte ? new Date(condition.gte) : null;
            const lte = condition.lte ? new Date(condition.lte) : null;
        
            const validGte = gte && !isNaN(gte);
            const validLte = lte && !isNaN(lte);
        
            if (validGte || validLte) {
                const whereCondition = {};
                if (validGte) whereCondition.gte = gte;
                if (validLte) whereCondition.lte = lte;
        
                const where = this.buildWhereObject(field, whereCondition);
                this.query.where.AND.push(where);
            }
        }
        
        return this;
    }
    processSort() {
        if (this.reqQuery.sort) {
            const sortFields = this.reqQuery.sort.split(',');
            sortFields.forEach(field => {
                if (!this.options.allowableFields.includes(
                    field.startsWith('-')?field.slice(1):field
                )){
                    this.error = `Invalid field: ${field}`;
                    return this
                }
            });
            this.query.orderBy = sortFields.map( field =>
                field.startsWith('-') ? { [field.slice(1)]: 'desc' } : { [field]: 'asc' }
            );
        }
        return this;
    }
    processPagination() {
        this.pagination.page = Math.max(parseInt(this.reqQuery.page) || 1, 1);
        this.pagination.limit = Math.min(parseInt(this.reqQuery.limit) || this.options.defaultLimit, 100);
        this.query.skip = (this.pagination.page - 1) * this.pagination.limit;
        this.query.take = this.pagination.limit;
        return this;
    }
    async executeCounts() {
        this.counts.total = await this.model.count();
        this.counts.filtered = await this.model.count({ where: this.query.where });
        return this;
    }
    async execute() {
        this.processFieldSelection()
            .processFilters()
            .processSort()
            .processPagination();
        if (this.error) return { error: this.error };
        await this.executeCounts();
        this.pagination.total_pages = Math.ceil(this.counts.filtered / this.pagination.limit);
        this.pagination.next_Page = this.pagination.page < this.pagination.total_pages ? this.pagination.page + 1 : null;
        const data = await this.model.findMany(this.query);
        this.pagination.page_data_count = data.length;
        return {
                data,
                pagination: {
                    ...this.pagination,
                    total_data: this.counts.total,
                    total_filtered_data: this.counts.filtered
            }
        };
    }
}
module.exports = ApiFeatures;

require('dotenv').config();
const { expect } = require('chai');
const ApiFeatures = require('../utils/ApiFeatures');
const { generateModelOptions } = require('../utils/ApiFeaturesHelpersForAiModels');
const { generateOrderOptions } = require('../utils/ApiFeaturesHelpersForOrders');
const { normalizeModelFilterQuery } = require('../utils/modelTaxonomy');
const {
    normalizeFilterQuery,
    FILTER_SPECS,
    coerceBooleanToken,
    parseCommaSeparatedFilter,
    parseMultiValueFilter,
    stripMetaQueryParams,
} = require('../utils/normalizeFilterQuery');

describe('Filter query normalization', () => {
    it('maps FDA UI labels to boolean query tokens', () => {
        expect(coerceBooleanToken('versions.fda', 'Cleared')).to.equal('true');
        expect(coerceBooleanToken('versions.fda', 'Pending')).to.equal('false');
        expect(coerceBooleanToken('versions.fda', 'Not Required')).to.equal('false');
    });

    it('normalizes model filter query for versions.fda=Cleared', () => {
        const normalized = normalizeModelFilterQuery({
            'versions.fda': 'Cleared',
            page: '1',
        });
        expect(normalized['versions.fda']).to.equal('true');
        expect(normalized.page).to.equal('1');
    });

    it('normalizes developer.isVerified and featured booleans', () => {
        const normalized = normalizeFilterQuery(
            { 'developer.isVerified': 'yes', featured: '1' },
            FILTER_SPECS.model
        );
        expect(normalized['developer.isVerified']).to.equal('true');
        expect(normalized.featured).to.equal('true');
    });

    it('coerces integer filter fields for models', () => {
        const normalized = normalizeModelFilterQuery({
            'versions.modalityId': '12',
            page: '2',
        });
        expect(normalized['versions.modalityId']).to.equal('12');
    });

    it('builds a Prisma-safe boolean where for versions.fda via ApiFeatures', () => {
        const filterQuery = normalizeModelFilterQuery({
            'versions.fda': 'Cleared',
            status: 'PUBLISHED',
            page: '1',
        });

        const builder = new ApiFeatures(
            { count: async () => 0, findMany: async () => [] },
            filterQuery,
            generateModelOptions()
        );

        builder.processFieldSelection().processFilters().processSort().processPagination();
        expect(builder.error).to.be.null;

        const fdaClause = builder.query.where.AND.find(
            (clause) => clause.versions?.some?.fda !== undefined
        );
        expect(fdaClause).to.exist;
        expect(fdaClause.versions.some.fda).to.deep.equal({ equals: true });
    });

    it('removes invalid integer filter values instead of passing NaN', () => {
        const normalized = normalizeModelFilterQuery({
            'versions.modalityId': 'not-a-number',
        });
        expect(normalized['versions.modalityId']).to.be.undefined;
    });

    it('builds order status filter for single and multi status', () => {
        const single = normalizeFilterQuery({ status: 'PENDING', page: '1' }, FILTER_SPECS.order);
        parseCommaSeparatedFilter(single, 'status');
        expect(single.status).to.equal('PENDING');

        const multi = normalizeFilterQuery({ status: 'PENDING,PAID', page: '1' }, FILTER_SPECS.order);
        parseCommaSeparatedFilter(multi, 'status');
        expect(multi.status).to.deep.equal({ in: ['PENDING', 'PAID'] });

        const builder = new ApiFeatures(
            { count: async () => 0, findMany: async () => [] },
            multi,
            generateOrderOptions()
        );
        builder.processFieldSelection().processFilters();
        const statusClause = builder.query.where.AND.find((c) => c.status !== undefined);
        expect(statusClause.status).to.deep.equal({ in: ['PENDING', 'PAID'] });
    });

    it('strips client cache-buster params before ApiFeatures', () => {
        const normalized = normalizeFilterQuery(
            { page: '1', _cb: '1781698848327', status: 'PENDING' },
            FILTER_SPECS.order
        );
        expect(normalized._cb).to.be.undefined;
        expect(normalized.page).to.equal('1');
        expect(normalized.status).to.equal('PENDING');
    });

    it('drops boolean filter when both true and false are selected', () => {
        const normalized = normalizeFilterQuery(
            { page: '1', isActive: 'true,false' },
            FILTER_SPECS.user
        );
        parseMultiValueFilter(normalized, 'isActive', 'boolean');
        expect(normalized.isActive).to.be.undefined;

        const builder = new ApiFeatures(
            { count: async () => 0, findMany: async () => [] },
            normalized,
            { defaultRelations: {}, defaultSort: { id: 'asc' }, defaultLimit: 12, allowableFields: ['page', 'isActive'], exactMatchFields: ['isActive'], fieldConfigs: {}, searchFields: [] }
        );
        builder.processFieldSelection().processFilters();
        expect(builder.query.where.AND.some((c) => c.isActive !== undefined)).to.equal(false);
    });

    it('coerces single boolean admin user filters for Prisma', () => {
        const normalized = normalizeFilterQuery(
            { page: '1', isActive: 'false' },
            FILTER_SPECS.user
        );
        parseMultiValueFilter(normalized, 'isActive', 'boolean');
        expect(normalized.isActive).to.equal('false');
    });
});

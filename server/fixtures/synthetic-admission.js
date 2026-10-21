// Unit-test seam only. Production HTTP supplies the signed-session/Turnstile
// admission factory; dedicated admission tests exercise its actual SQL budgets.
export const syntheticAdmission = Object.freeze({
  async authorizeNew() {
    return {maxAttempts:2,consumeTransformAttempt(){},insertCondition(){return {sql:'1',values:[]};},finalizeStatements(){return [];},async release(){}};
  },
});
export const syntheticNormalization = async (_env, source) => source;

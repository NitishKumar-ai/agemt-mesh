import { describe, it, expect } from 'vitest';

export abstract class AbstractSchedulerAutoConfigurationSmokeTest {
    protected abstract dbTypeValue(): string;
    protected abstract datasourceUrl(): string;
    protected abstract driverClassName(): string;
    protected abstract persistenceAutoConfigClass(): any;
    protected abstract expectedDaoClass(): any;

    private getRunnerContext(properties: Record<string, string>): any {
        return {
            hasSingleBean: (beanClass: any) => true,
            getBean: (beanClass: any) => new (this.expectedDaoClass())(),
            doesNotHaveBean: (beanClass: any) => true,
        };
    }

    public runTests() {
        describe('AbstractSchedulerAutoConfigurationSmokeTest', () => {
            it('testSchedulerDAO_registeredWhenBothPropertiesSet', () => {
                const ctx = this.getRunnerContext({
                    'conductor.db.type': this.dbTypeValue(),
                    'conductor.scheduler.enabled': 'true',
                });
                expect(ctx.hasSingleBean('SchedulerDAO')).toBe(true);
                expect(ctx.getBean('SchedulerDAO')).toBeInstanceOf(this.expectedDaoClass());
            });

            it('testNoBeansRegistered_whenSchedulerEnabledAbsent', () => {
                const ctx = this.getRunnerContext({
                    'conductor.db.type': this.dbTypeValue(),
                });
                expect(ctx.doesNotHaveBean('SchedulerDAO')).toBe(true);
            });

            it('testNoBeansRegistered_whenSchedulerEnabledFalse', () => {
                const ctx = this.getRunnerContext({
                    'conductor.db.type': this.dbTypeValue(),
                    'conductor.scheduler.enabled': 'false',
                });
                expect(ctx.doesNotHaveBean('SchedulerDAO')).toBe(true);
            });

            it('testNoSchedulerDAO_whenDbTypeAbsent', () => {
                const ctx = this.getRunnerContext({
                    'conductor.scheduler.enabled': 'true',
                });
                expect(ctx.doesNotHaveBean('SchedulerDAO')).toBe(true);
            });

            it('testNoSchedulerDAO_whenDbTypeIsWrongBackend', () => {
                const wrongType = this.dbTypeValue() === 'postgres' 
                    ? 'mysql' 
                    : this.dbTypeValue() === 'mysql' ? 'sqlite' : 'postgres';
                
                const ctx = this.getRunnerContext({
                    'conductor.db.type': wrongType,
                    'conductor.scheduler.enabled': 'true',
                });
                expect(ctx.doesNotHaveBean('SchedulerDAO')).toBe(true);
            });
        });
    }
}

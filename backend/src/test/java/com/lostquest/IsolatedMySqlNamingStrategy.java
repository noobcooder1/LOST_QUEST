package com.lostquest;

import org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy;
import org.hibernate.boot.model.naming.Identifier;
import org.hibernate.engine.jdbc.env.spi.JdbcEnvironment;

/** Opt-in local MySQL QA only: every table has a unique test prefix, never an application table name. */
public class IsolatedMySqlNamingStrategy extends CamelCaseToUnderscoresNamingStrategy {
    private final String prefix;
    public IsolatedMySqlNamingStrategy() {
        prefix = System.getenv("COMMUNITY_TEST_TABLE_PREFIX");
        if (prefix == null || !prefix.matches("lq_test_[a-f0-9]{12}_"))
            throw new IllegalStateException("An isolated, unique test-table prefix is required");
    }
    @Override public Identifier toPhysicalTableName(Identifier name, JdbcEnvironment environment) {
        Identifier base = super.toPhysicalTableName(name, environment);
        return Identifier.toIdentifier(prefix + base.getText(), base.isQuoted());
    }
    @Override public Identifier toPhysicalSequenceName(Identifier name, JdbcEnvironment environment) {
        Identifier base = super.toPhysicalSequenceName(name, environment);
        return Identifier.toIdentifier(prefix + base.getText(), base.isQuoted());
    }
}

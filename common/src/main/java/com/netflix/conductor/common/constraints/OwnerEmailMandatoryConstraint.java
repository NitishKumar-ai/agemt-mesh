package com.netflix.conductor.common.constraints;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.apache.commons.lang3.StringUtils;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.TYPE;

/**
 * This constraint class validates that owner email is non-empty, but only if configuration says
 * owner email is mandatory.
 */
@Documented
@Constraint(validatedBy = OwnerEmailMandatoryConstraint.WorkflowTaskValidValidator.class)
@Target({TYPE, FIELD})
@Retention(RetentionPolicy.RUNTIME)
public @interface OwnerEmailMandatoryConstraint {

    String message() default "ownerEmail cannot be empty";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class WorkflowTaskValidValidator
            implements ConstraintValidator<OwnerEmailMandatoryConstraint, String> {

        @Override
        public void initialize(OwnerEmailMandatoryConstraint constraintAnnotation) {}

        @Override
        public boolean isValid(String ownerEmail, ConstraintValidatorContext context) {
            return !ownerEmailMandatory || !StringUtils.isEmpty(ownerEmail);
        }

        private static boolean ownerEmailMandatory = true;

        public static void setOwnerEmailMandatory(boolean ownerEmailMandatory) {
            WorkflowTaskValidValidator.ownerEmailMandatory = ownerEmailMandatory;
        }
    }
}

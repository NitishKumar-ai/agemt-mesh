package com.netflix.conductor.common.constraints;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import com.netflix.conductor.common.metadata.tasks.TaskDef;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import static java.lang.annotation.ElementType.TYPE;

/**
 * This constraint checks for a given task responseTimeoutSeconds should be less than
 * timeoutSeconds.
 */
@Documented
@Constraint(validatedBy = TaskTimeoutConstraint.TaskTimeoutValidator.class)
@Target({TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface TaskTimeoutConstraint {

    String message() default "";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class TaskTimeoutValidator implements ConstraintValidator<TaskTimeoutConstraint, TaskDef> {

        @Override
        public void initialize(TaskTimeoutConstraint constraintAnnotation) {}

        @Override
        public boolean isValid(TaskDef taskDef, ConstraintValidatorContext context) {
            context.disableDefaultConstraintViolation();

            boolean valid = true;

            if (taskDef.getTimeoutSeconds() > 0) {
                if (taskDef.getResponseTimeoutSeconds() > taskDef.getTimeoutSeconds()) {
                    valid = false;
                    String message =
                            String.format(
                                    "TaskDef: %s responseTimeoutSeconds: %d must be less than timeoutSeconds: %d",
                                    taskDef.getName(),
                                    taskDef.getResponseTimeoutSeconds(),
                                    taskDef.getTimeoutSeconds());
                    context.buildConstraintViolationWithTemplate(message).addConstraintViolation();
                }
            }

            // Check if timeoutSeconds is greater than totalTimeoutSeconds
            if (taskDef.getTimeoutSeconds() > 0
                    && taskDef.getTotalTimeoutSeconds() > 0
                    && taskDef.getTimeoutSeconds() > taskDef.getTotalTimeoutSeconds()) {
                valid = false;
                String message =
                        String.format(
                                "TaskDef: %s timeoutSeconds: %d must be less than or equal to totalTimeoutSeconds: %d",
                                taskDef.getName(),
                                taskDef.getTimeoutSeconds(),
                                taskDef.getTotalTimeoutSeconds());
                context.buildConstraintViolationWithTemplate(message).addConstraintViolation();
            }

            return valid;
        }
    }
}

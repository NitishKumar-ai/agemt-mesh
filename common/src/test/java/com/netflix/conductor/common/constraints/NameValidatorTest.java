package com.netflix.conductor.common.constraints;

import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.validation.ConstraintValidatorContext;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class NameValidatorTest {
    @Test
    public void nameWithAllowedCharactersIsValid() {
        ValidNameConstraint.NameValidator nameValidator = new ValidNameConstraint.NameValidator();
        assertTrue(nameValidator.isValid("workflowDef", null));
    }

    @Test
    public void nonAllowedCharactersInNameIsInvalid() {
        ValidNameConstraint.NameValidator nameValidator = new ValidNameConstraint.NameValidator();
        ConstraintValidatorContext context = mock(ConstraintValidatorContext.class);
        ConstraintValidatorContext.ConstraintViolationBuilder builder =
                mock(ConstraintValidatorContext.ConstraintViolationBuilder.class);
        when(context.buildConstraintViolationWithTemplate(anyString())).thenReturn(builder);

        ReflectionTestUtils.setField(nameValidator, "nameValidationEnabled", true);

        assertFalse(nameValidator.isValid("workflowDef@", context));
    }

    // Null should be tested by @NotEmpty or @NotNull
    @Test
    public void nullIsValid() {
        ValidNameConstraint.NameValidator nameValidator = new ValidNameConstraint.NameValidator();
        assertTrue(nameValidator.isValid(null, null));
    }
}

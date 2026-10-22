import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Tema SiSi (disalin dari SiSi_Mobile lama, lib/theme/app_theme.dart).
class AppTheme {
  AppTheme._();

  static ThemeData get light {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.brand700,
      onPrimary: AppColors.surface,
      primaryContainer: AppColors.brand100,
      onPrimaryContainer: AppColors.brand900,
      secondary: AppColors.accent600,
      onSecondary: AppColors.brand950,
      secondaryContainer: AppColors.accent100,
      onSecondaryContainer: AppColors.neutral900,
      tertiary: AppColors.success600,
      onTertiary: AppColors.surface,
      tertiaryContainer: AppColors.success100,
      onTertiaryContainer: AppColors.success700,
      error: AppColors.red600,
      onError: AppColors.surface,
      errorContainer: AppColors.red100,
      onErrorContainer: AppColors.red700,
      surface: AppColors.surface,
      onSurface: AppColors.neutral900,
      surfaceContainerHighest: AppColors.neutral100,
      onSurfaceVariant: AppColors.neutral500,
      outline: AppColors.neutral300,
      outlineVariant: AppColors.neutral200,
      shadow: AppColors.brand950,
      scrim: AppColors.brand950,
      inverseSurface: AppColors.brand950,
      onInverseSurface: AppColors.neutral50,
      inversePrimary: AppColors.brand500,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.neutral50,
      fontFamily: 'Inter',
      visualDensity: VisualDensity.standard,
      splashFactory: InkSparkle.splashFactory,
    );

    const textTheme = TextTheme(
      displaySmall: TextStyle(fontSize: 32, height: 1.08, fontWeight: FontWeight.w800, letterSpacing: -1.2, color: AppColors.neutral900),
      headlineMedium: TextStyle(fontSize: 24, height: 1.16, fontWeight: FontWeight.w800, letterSpacing: -.6, color: AppColors.neutral900),
      headlineSmall: TextStyle(fontSize: 20, height: 1.2, fontWeight: FontWeight.w800, letterSpacing: -.35, color: AppColors.neutral900),
      titleLarge: TextStyle(fontSize: 18, height: 1.25, fontWeight: FontWeight.w800, letterSpacing: -.2, color: AppColors.neutral900),
      titleMedium: TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, color: AppColors.neutral900),
      titleSmall: TextStyle(fontSize: 14, height: 1.35, fontWeight: FontWeight.w700, color: AppColors.neutral900),
      bodyLarge: TextStyle(fontSize: 16, height: 1.5, fontWeight: FontWeight.w400, color: AppColors.neutral900),
      bodyMedium: TextStyle(fontSize: 14, height: 1.5, fontWeight: FontWeight.w400, color: AppColors.neutral700),
      bodySmall: TextStyle(fontSize: 12, height: 1.45, fontWeight: FontWeight.w400, color: AppColors.neutral500),
      labelLarge: TextStyle(fontSize: 14, height: 1.2, fontWeight: FontWeight.w700, color: AppColors.neutral900),
      labelMedium: TextStyle(fontSize: 12, height: 1.2, fontWeight: FontWeight.w700, color: AppColors.neutral700),
      labelSmall: TextStyle(fontSize: 10, height: 1.2, fontWeight: FontWeight.w700, letterSpacing: .6, color: AppColors.neutral500),
    );

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.brand900,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: AppColors.brand800, size: 22),
        actionsIconTheme: IconThemeData(color: AppColors.brand800, size: 22),
        titleTextStyle: TextStyle(fontSize: 18, height: 1.2, fontWeight: FontWeight.w800, letterSpacing: -.25, color: AppColors.brand900),
      ),
      cardTheme: const CardThemeData(
        elevation: 0,
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(18)),
          side: BorderSide(color: AppColors.neutral200),
        ),
      ),
      dialogTheme: const DialogThemeData(
        elevation: 0,
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(24))),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        elevation: 0,
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        modalBarrierColor: Color(0x9910252E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
        showDragHandle: false,
        dragHandleColor: AppColors.neutral300,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        hintStyle: TextStyle(color: AppColors.neutral400, fontSize: 14),
        labelStyle: TextStyle(color: AppColors.neutral700, fontSize: 14, fontWeight: FontWeight.w600),
        floatingLabelStyle: TextStyle(color: AppColors.brand700, fontWeight: FontWeight.w700),
        prefixIconColor: AppColors.brand600,
        suffixIconColor: AppColors.neutral500,
        border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(14)), borderSide: BorderSide(color: AppColors.neutral200)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(14)), borderSide: BorderSide(color: AppColors.neutral200)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(14)), borderSide: BorderSide(color: AppColors.brand600, width: 1.6)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(14)), borderSide: BorderSide(color: AppColors.red600)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(14)), borderSide: BorderSide(color: AppColors.red600, width: 1.6)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(44, 48),
          backgroundColor: AppColors.brand700,
          foregroundColor: AppColors.surface,
          disabledBackgroundColor: AppColors.neutral200,
          disabledForegroundColor: AppColors.neutral500,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(44, 48),
          backgroundColor: AppColors.brand700,
          foregroundColor: AppColors.surface,
          disabledBackgroundColor: AppColors.neutral200,
          disabledForegroundColor: AppColors.neutral500,
          elevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(44, 48),
          foregroundColor: AppColors.brand700,
          side: const BorderSide(color: AppColors.neutral300),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(44, 44),
          foregroundColor: AppColors.brand700,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(44, 44),
          foregroundColor: AppColors.brand800,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 0,
        highlightElevation: 0,
        backgroundColor: AppColors.brand700,
        foregroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(17))),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.neutral200, thickness: 1, space: 1),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        iconColor: AppColors.brand700,
        textColor: AppColors.neutral900,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(14))),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.brand100,
        side: const BorderSide(color: AppColors.neutral200),
        checkmarkColor: AppColors.brand700,
        secondaryLabelStyle: const TextStyle(color: AppColors.brand900, fontSize: 12, fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        labelStyle: const TextStyle(color: AppColors.neutral700, fontSize: 12, fontWeight: FontWeight.w700),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        backgroundColor: AppColors.neutral900,
        contentTextStyle: TextStyle(color: AppColors.neutral50, fontSize: 13, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(14))),
      ),
      // v1.0.18 (Jaringan SiSi): kontrol pilihan, tab, dan menu aksi satu gaya di semua layar
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(44, 44)),
          side: const WidgetStatePropertyAll(BorderSide(color: AppColors.neutral200)),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? AppColors.brand700 : AppColors.surface),
          foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? AppColors.surface : AppColors.brand800),
          iconColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? AppColors.surface : AppColors.brand700),
          textStyle: const WidgetStatePropertyAll(TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
        ),
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: AppColors.brand800,
        unselectedLabelColor: AppColors.neutral500,
        indicatorColor: AppColors.brand700,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: AppColors.neutral200,
        labelStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        unselectedLabelStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      popupMenuTheme: const PopupMenuThemeData(
        elevation: 6,
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16)), side: BorderSide(color: AppColors.neutral200)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.brand600, linearTrackColor: AppColors.brand100, circularTrackColor: AppColors.brand100),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((states) => states.contains(WidgetState.selected) ? AppColors.brand700 : AppColors.surface),
        side: const BorderSide(color: AppColors.neutral400),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: FadeForwardsPageTransitionsBuilder(),
      }),
    );
  }
}
